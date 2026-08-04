/**
 * Moderation job processor.
 *
 * Stack choice: database-backed `processing_jobs` (not Cloudflare Queues yet).
 * This module is the source of truth for handling moderation jobs; invoke it from:
 *   - `npm run worker:moderation` (long-running poll loop)
 *   - POST /api/jobs/moderation (cron / one-shot drain)
 *
 * Flow per job:
 *   1. Claim job with mediaId + object key
 *   2. processMediaModeration(mediaId, key)
 *   3. Outcomes:
 *        clean  → ensure permanent originals/ key + status ready
 *        adult  → keep moderation_status adult (lifecycle rejected)
 *        rejected → leave rejected
 *        csam   → quarantine + NCMEC (handled inside processMediaModeration)
 *   4. Mark processing_jobs completed / failed (with retries)
 *
 * Idempotent: already-terminal media rows complete the job without re-scanning.
 */

import { config as loadEnv } from "dotenv";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { media, type Media, type ProcessingJob } from "@/lib/db/schema";
import {
  processMediaModeration,
  type ProcessMediaModerationOutcome,
} from "@/lib/moderation/service";
import { reportCsamIncidentForMedia } from "@/lib/moderation/ncmec";
import type { ModerationStatus } from "@/lib/moderation/types";
import {
  claimNextModerationJob,
  completeJob,
  failJob,
  reclaimStaleProcessingJobs,
} from "@/lib/queue";
import { maybeEnqueueFaceDetectionForMedia } from "@/lib/faces/pipeline";
import { maybeEnqueueSceneAnalysisForMedia } from "@/lib/media/scene";
import { maybeGenerateThumbnailForMedia } from "@/lib/media/thumbnails";
import {
  LogEvents,
  logJobFailure,
  logModerationDecision,
} from "@/lib/observability/events";
import { logger } from "@/lib/observability/logger";
import {
  isOriginalsKey,
  isQuarantineKey,
  isTempKey,
  promoteTempToOriginals,
  tempKeyToOriginalsKey,
} from "@/lib/r2";

const LOG = "[worker.moderation]";

const moderationJobPayloadSchema = z.object({
  mediaId: z.string().min(1).optional(),
  originalKey: z.string().min(1).optional(),
  key: z.string().min(1).optional(),
  contentType: z.string().optional(),
  userId: z.string().optional(),
});

export type ModerationJobPayload = z.infer<typeof moderationJobPayloadSchema>;

export type ProcessModerationJobResult = {
  jobId: string;
  mediaId: string;
  skipped: boolean;
  skipReason?: string;
  outcome?: ProcessMediaModerationOutcome;
  finalModerationStatus?: ModerationStatus;
  finalLifecycleStatus?: Media["status"];
};

/** Terminal moderation states — safe to no-op on retry. */
const TERMINAL_MODERATION = new Set<ModerationStatus>([
  "clean",
  "adult",
  "rejected",
  "csam_quarantined",
  "needs_human_review",
]);

function log(
  level: "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>,
) {
  logger[level]("worker.moderation", {
    worker: "moderation",
    message,
    ...meta,
  });
}

function resolveJobInputs(job: ProcessingJob): {
  mediaId: string;
  key: string | null;
} {
  const parsed = moderationJobPayloadSchema.safeParse(job.payload ?? {});
  if (!parsed.success) {
    throw new Error(
      `Invalid moderation job payload: ${parsed.error.message}`,
    );
  }

  const mediaId = job.mediaId ?? parsed.data.mediaId;
  const key = parsed.data.originalKey ?? parsed.data.key ?? null;

  if (!mediaId) {
    throw new Error(`Job ${job.id} is missing mediaId.`);
  }

  return { mediaId, key };
}

async function loadMedia(mediaId: string): Promise<Media | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);
  return row ?? null;
}

/**
 * Ensure clean media lives under originals/ (permanent library prefix).
 * Upload-complete usually promotes already; this covers retries / older jobs.
 */
async function ensurePermanentLocation(row: Media): Promise<Media> {
  const key = row.originalKey;

  if (isQuarantineKey(key)) {
    // Should not happen for clean media; refuse to "promote" quarantine.
    throw new Error(
      `Refusing to promote quarantined key "${key}" to originals/.`,
    );
  }

  if (isOriginalsKey(key)) {
    log("info", "Object already under originals/", {
      mediaId: row.id,
      key,
    });
    return row;
  }

  if (!isTempKey(key)) {
    log("warn", "Unexpected key prefix for clean media; leaving as-is", {
      mediaId: row.id,
      key,
    });
    return row;
  }

  const destination = tempKeyToOriginalsKey(key);
  log("info", "Promoting temp/ → originals/ for clean media", {
    mediaId: row.id,
    fromKey: key,
    toKey: destination,
  });

  const moved = await promoteTempToOriginals(key, destination);
  const db = getDb();
  const [updated] = await db
    .update(media)
    .set({
      originalKey: moved.toKey,
      updatedAt: new Date(),
    })
    .where(eq(media.id, row.id))
    .returning();

  return updated ?? { ...row, originalKey: moved.toKey };
}

function isAlreadyHandled(row: Media): { handled: boolean; reason?: string } {
  if (
    row.moderationStatus === "clean" &&
    (row.status === "ready" || isOriginalsKey(row.originalKey))
  ) {
    return {
      handled: true,
      reason: "Media already clean/ready — idempotent skip.",
    };
  }

  if (row.moderationStatus === "csam_quarantined") {
    // Quarantine is terminal for library visibility, but NCMEC may still be pending.
    if (row.ncmecReportId?.trim()) {
      return {
        handled: true,
        reason:
          "Media already csam_quarantined with NCMEC report id — idempotent skip.",
      };
    }
    return {
      handled: false,
      reason: "csam_quarantined without ncmecReportId — resume reporting",
    };
  }

  if (
    row.moderationStatus === "adult" ||
    row.moderationStatus === "rejected" ||
    row.moderationStatus === "needs_human_review"
  ) {
    return {
      handled: true,
      reason: `Media already ${row.moderationStatus} — idempotent skip.`,
    };
  }

  if (TERMINAL_MODERATION.has(row.moderationStatus) && row.status === "ready") {
    return { handled: true, reason: "Terminal moderation with ready status." };
  }

  return { handled: false };
}

/**
 * Process a single claimed moderation job.
 * Safe to retry: terminal media states complete without re-running scanners.
 */
export async function processModerationJob(
  job: ProcessingJob,
): Promise<ProcessModerationJobResult> {
  const { mediaId, key: payloadKey } = resolveJobInputs(job);

  const existing = await loadMedia(mediaId);
  if (!existing) {
    throw new Error(`Media not found for job ${job.id}: ${mediaId}`);
  }

  // Prefer payload key; fall back to the media row for older/seed-style jobs.
  const resolvedKey = payloadKey || existing.originalKey || null;
  if (!resolvedKey) {
    throw new Error(
      `Job ${job.id} is missing object key (payload.originalKey or payload.key, and media.original_key).`,
    );
  }

  log("info", "Processing job", {
    jobId: job.id,
    type: job.type,
    attempt: job.attempts,
    maxAttempts: job.maxAttempts,
    mediaId,
    key: resolvedKey,
  });

  const already = isAlreadyHandled(existing);
  if (already.handled) {
    // Still ensure clean media sits on originals/ if a prior run skipped promote.
    let row = existing;
    if (existing.moderationStatus === "clean") {
      row = await ensurePermanentLocation(existing);
      if (row.status !== "ready") {
        const db = getDb();
        const [fixed] = await db
          .update(media)
          .set({ status: "ready", updatedAt: new Date() })
          .where(eq(media.id, mediaId))
          .returning();
        row = fixed ?? row;
      }
    }

    log("info", "Idempotent skip", {
      jobId: job.id,
      mediaId,
      reason: already.reason,
      moderationStatus: row.moderationStatus,
      status: row.status,
    });

    // Backfill: clean photos that never got face jobs still get enqueued.
    if (row.moderationStatus === "clean" && row.status === "ready") {
      await maybeGenerateThumbnailForMedia(row);
      await maybeEnqueueFaceDetectionForMedia(row, {
        source: "worker.moderation.idempotent_clean",
      });
      await maybeEnqueueSceneAnalysisForMedia(row, {
        source: "worker.moderation.idempotent_clean",
      });
    }

    await completeJob(job.id);
    return {
      jobId: job.id,
      mediaId,
      skipped: true,
      skipReason: already.reason,
      finalModerationStatus: row.moderationStatus,
      finalLifecycleStatus: row.status,
    };
  }

  // Quarantined but NCMEC never persisted — resume reporting without re-scanning.
  if (
    existing.moderationStatus === "csam_quarantined" &&
    !existing.ncmecReportId?.trim()
  ) {
    log("warn", "Resuming NCMEC reporting for quarantined media", {
      jobId: job.id,
      mediaId,
      originalKey: existing.originalKey,
    });
    const report = await reportCsamIncidentForMedia(
      mediaId,
      existing.originalKey || resolvedKey,
      {
        detectedAt: existing.quarantinedAt ?? new Date(),
        additionalInfo:
          "Resumed CyberTipline reporting after prior incomplete attempt.",
      },
    );
    await completeJob(job.id);
    return {
      jobId: job.id,
      mediaId,
      skipped: false,
      outcome: {
        media: report.media,
        decision: {
          status: "csam_quarantined",
          result: {
            photodnaMatch: Boolean(report.media.photodnaMatch),
            aiCsamScore: report.media.aiCsamScore ?? null,
            aiNudityScore: report.media.aiNudityScore ?? null,
            provider: "moderation.ncmec.resume",
            notes: "Resumed NCMEC after quarantine without report id",
          },
          reason: "Resumed NCMEC reporting",
        },
        ncmecReportId: report.reportId,
      },
      finalModerationStatus: report.media.moderationStatus,
      finalLifecycleStatus: report.media.status,
    };
  }

  // Prefer live DB key (may already be originals/) over stale payload key.
  const scanKey = existing.originalKey || resolvedKey;

  log("info", "Calling processMediaModeration", {
    jobId: job.id,
    mediaId,
    scanKey,
  });

  const outcome = await processMediaModeration(mediaId, scanKey);
  const { decision } = outcome;

  log("info", "Moderation decision", {
    jobId: job.id,
    mediaId,
    status: decision.status,
    reason: decision.reason,
    photodnaMatch: decision.result.photodnaMatch,
    aiCsamScore: decision.result.aiCsamScore,
    aiNudityScore: decision.result.aiNudityScore,
    ncmecReportId: outcome.ncmecReportId ?? null,
  });
  logModerationDecision({
    jobId: job.id,
    mediaId,
    status: decision.status,
    reason: decision.reason,
    photodnaMatch: decision.result.photodnaMatch,
    ncmecReportId: outcome.ncmecReportId ?? null,
  });

  let finalMedia = outcome.media;

  switch (decision.status) {
    case "clean": {
      // Permanent location + ready (service sets ready; ensure originals/).
      finalMedia = await ensurePermanentLocation(finalMedia);
      if (finalMedia.status !== "ready" || finalMedia.moderationStatus !== "clean") {
        const db = getDb();
        const [updated] = await db
          .update(media)
          .set({
            status: "ready",
            moderationStatus: "clean",
            updatedAt: new Date(),
          })
          .where(eq(media.id, mediaId))
          .returning();
        finalMedia = updated ?? finalMedia;
      }
      log("info", "Outcome: CLEAN — library eligible", {
        jobId: job.id,
        mediaId,
        originalKey: finalMedia.originalKey,
        status: finalMedia.status,
      });
      // Non-blocking: face + scene work run on separate queues/workers.
      await maybeGenerateThumbnailForMedia(finalMedia);
      await maybeEnqueueFaceDetectionForMedia(finalMedia, {
        source: "worker.moderation.clean",
      });
      await maybeEnqueueSceneAnalysisForMedia(finalMedia, {
        source: "worker.moderation.clean",
      });
      const { queueMediaReadyNotification } = await import(
        "@/lib/email/lifecycle"
      );
      queueMediaReadyNotification({
        userId: finalMedia.userId,
        mediaId: finalMedia.id,
        filename: finalMedia.originalFilename,
      });
      break;
    }
    case "adult": {
      // Current policy: moderation_status=adult, lifecycle rejected (not in family gallery).
      log("info", "Outcome: ADULT — restricted from family surfaces", {
        jobId: job.id,
        mediaId,
        status: finalMedia.status,
        moderationStatus: finalMedia.moderationStatus,
      });
      break;
    }
    case "rejected": {
      log("info", "Outcome: REJECTED", {
        jobId: job.id,
        mediaId,
        status: finalMedia.status,
      });
      break;
    }
    case "needs_human_review": {
      log("info", "Outcome: NEEDS_HUMAN_REVIEW — held out of library", {
        jobId: job.id,
        mediaId,
        status: finalMedia.status,
        moderationStatus: finalMedia.moderationStatus,
        reason: decision.reason,
      });
      break;
    }
    case "csam_quarantined": {
      // Quarantine + NCMEC already performed inside processMediaModeration.
      log("info", "Outcome: CSAM — quarantined + NCMEC path", {
        jobId: job.id,
        mediaId,
        originalKey: finalMedia.originalKey,
        ncmecReportId: outcome.ncmecReportId ?? finalMedia.ncmecReportId,
        quarantinedAt: finalMedia.quarantinedAt?.toISOString() ?? null,
      });
      break;
    }
    default: {
      log("warn", "Unexpected moderation status after processing", {
        jobId: job.id,
        mediaId,
        status: decision.status,
      });
    }
  }

  await completeJob(job.id);
  log("info", "Job completed", {
    jobId: job.id,
    mediaId,
    moderationStatus: finalMedia.moderationStatus,
    status: finalMedia.status,
  });

  return {
    jobId: job.id,
    mediaId,
    skipped: false,
    outcome: { ...outcome, media: finalMedia },
    finalModerationStatus: finalMedia.moderationStatus,
    finalLifecycleStatus: finalMedia.status,
  };
}

/**
 * Claim and process up to `limit` moderation jobs.
 * Returns results for each attempted job (success or recorded failure).
 */
export async function drainModerationJobs(
  limit = 10,
): Promise<{
  processed: ProcessModerationJobResult[];
  failures: { jobId: string; error: string }[];
  reclaimed: number;
}> {
  const reclaimed = await reclaimStaleProcessingJobs();
  if (reclaimed > 0) {
    log("warn", "Reclaimed stale processing jobs", { count: reclaimed });
  }

  const processed: ProcessModerationJobResult[] = [];
  const failures: { jobId: string; error: string }[] = [];

  for (let i = 0; i < limit; i++) {
    const job = await claimNextModerationJob();
    if (!job) {
      break;
    }

    try {
      const result = await processModerationJob(job);
      processed.push(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown moderation worker error";
      log("error", "Job failed — will retry if attempts remain", {
        jobId: job.id,
        mediaId: job.mediaId,
        attempt: job.attempts,
        maxAttempts: job.maxAttempts,
        error: message,
      });
      const { willRetry } = await failJob(job.id, message, {
        retryDelayMs: Number(process.env.QUEUE_RETRY_DELAY_MS ?? 30_000),
      });

      // Permanent processing failure: surface a clear rejection so uploads don't
      // sit forever as pending_moderation with no gallery visibility.
      if (!willRetry && job.mediaId) {
        try {
          const { updateMediaModerationStatus } = await import(
            "@/lib/moderation/db"
          );
          await updateMediaModerationStatus(job.mediaId, "rejected", {
            photodnaMatch: false,
            provider: "worker.moderation",
            notes: `Processing failed after ${job.maxAttempts} attempts: ${message.slice(0, 500)}`,
            labels: {
              provider: "worker.moderation",
              labels: ["processing_failed"],
              raw: { lastError: message.slice(0, 1000) },
            },
            raw: { stage: "moderation_worker", lastError: message.slice(0, 1000) },
          });
          log("warn", "Marked media rejected after permanent job failure", {
            jobId: job.id,
            mediaId: job.mediaId,
            error: message.slice(0, 300),
          });
        } catch (markError) {
          log("error", "Failed to mark media rejected after job failure", {
            jobId: job.id,
            mediaId: job.mediaId,
            error:
              markError instanceof Error ? markError.message : String(markError),
          });
        }
      }

      logJobFailure(
        LogEvents.moderationJobFailed,
        {
          jobId: job.id,
          mediaId: job.mediaId,
          attempt: job.attempts,
          maxAttempts: job.maxAttempts,
          willRetry,
        },
        error,
      );
      failures.push({ jobId: job.id, error: message });
    }
  }

  return { processed, failures, reclaimed };
}

/**
 * Long-running poll loop for local/dev or a dedicated worker process.
 * Exit with Ctrl+C. Respects WORKER_ENABLED when started via CLI.
 */
export async function runModerationWorkerLoop(): Promise<void> {
  const intervalMs = Number(process.env.QUEUE_POLL_INTERVAL_MS ?? 5000);
  const batchSize = Number(process.env.QUEUE_BATCH_SIZE ?? 5);

  log("info", "Moderation worker loop starting", {
    intervalMs,
    batchSize,
    mockScenario: process.env.MODERATION_MOCK_SCENARIO ?? "clean",
  });

  let stopping = false;
  const stop = () => {
    stopping = true;
    log("info", "Shutdown signal received — finishing current batch");
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (!stopping) {
    try {
      const { processed, failures, reclaimed } =
        await drainModerationJobs(batchSize);
      if (processed.length > 0 || failures.length > 0 || reclaimed > 0) {
        log("info", "Batch finished", {
          processed: processed.length,
          failures: failures.length,
          reclaimed,
        });
      }
    } catch (error) {
      log("error", "Worker loop iteration failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  log("info", "Moderation worker loop stopped");
}

/** CLI entry: `tsx src/workers/moderation.ts` */
async function main() {
  loadEnv({ path: ".env.local", override: true });
  loadEnv({ override: true });

  // Local-only: corporate TLS interceptors on Windows. Never in production.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_INSECURE_TLS === "true"
  ) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    log("warn", "ALLOW_INSECURE_TLS=true — TLS verification disabled (dev only)");
  }

  if (process.env.WORKER_ENABLED === "false") {
    log(
      "warn",
      "WORKER_ENABLED=false — set WORKER_ENABLED=true (or unset) to run the poll loop. Running a single drain pass instead.",
    );
    const result = await drainModerationJobs(
      Number(process.env.QUEUE_BATCH_SIZE ?? 10),
    );
    log("info", "Single drain complete", result);
    return;
  }

  await runModerationWorkerLoop();
}

const isDirectCli =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv.some(
    (arg) =>
      arg.includes("workers/moderation") ||
      arg.replace(/\\/g, "/").endsWith("workers/moderation.ts"),
  );

if (isDirectCli) {
  main().catch((error) => {
    console.error(`${LOG} fatal`, error);
    process.exit(1);
  });
}
