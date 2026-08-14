/**
 * Face detection job processor.
 *
 * Runs after media is clean/ready (enqueued from moderation / human review).
 * Does not block upload or moderation — separate queue + worker.
 *
 * Invoke via:
 *   - `npm run worker:faces` (poll loop)
 *   - POST /api/jobs/faces (cron / one-shot drain)
 *
 * Per job: detectAndStoreFacesForMedia → groupFaces for stored face ids.
 */

import { config as loadEnv } from "dotenv";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { media, type Media, type ProcessingJob } from "@/lib/db/schema";
import { FaceDetectionError } from "@/lib/faces/detection";
import {
  processFacesForMedia,
  type ProcessFacesForMediaResult,
} from "@/lib/faces/pipeline";
import {
  claimNextFaceDetectionJob,
  completeJob,
  failJob,
  reclaimStaleFaceDetectionJobs,
} from "@/lib/queue";
import { LogEvents, logJobFailure } from "@/lib/observability/events";
import { errorFields, logger } from "@/lib/observability/logger";

const faceJobPayloadSchema = z.object({
  mediaId: z.string().min(1).optional(),
  userId: z.string().optional(),
  replaceExisting: z.boolean().optional(),
});

export type ProcessFaceJobResult = {
  jobId: string;
  mediaId: string;
  skipped: boolean;
  skipReason?: string;
  result?: ProcessFacesForMediaResult;
};

function log(
  level: "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>,
) {
  logger[level]("worker.faces", {
    worker: "faces",
    message,
    ...meta,
  });
}

function resolveMediaId(job: ProcessingJob): string {
  const parsed = faceJobPayloadSchema.safeParse(job.payload ?? {});
  if (!parsed.success) {
    throw new Error(`Invalid face.detect job payload: ${parsed.error.message}`);
  }
  const mediaId = job.mediaId ?? parsed.data.mediaId;
  if (!mediaId) {
    throw new Error(`Job ${job.id} is missing mediaId.`);
  }
  return mediaId;
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
 * Process one claimed face.detect job.
 * Policy skips (not clean / not photo / already done) complete successfully.
 */
export async function processFaceDetectionJob(
  job: ProcessingJob,
): Promise<ProcessFaceJobResult> {
  const mediaId = resolveMediaId(job);
  const parsed = faceJobPayloadSchema.safeParse(job.payload ?? {});
  const replaceExisting = parsed.success
    ? Boolean(parsed.data.replaceExisting)
    : false;
  const payloadUserId = parsed.success ? parsed.data.userId : undefined;

  log("info", "Processing job", {
    jobId: job.id,
    attempt: job.attempts,
    maxAttempts: job.maxAttempts,
    mediaId,
    replaceExisting,
  });

  const row = await loadMedia(mediaId);
  if (!row) {
    throw new Error(`Media not found for job ${job.id}: ${mediaId}`);
  }

  if (payloadUserId && payloadUserId !== row.userId) {
    const { canViewMedia } = await import("@/lib/permissions");
    if (!(await canViewMedia(payloadUserId, mediaId))) {
      log("warn", "Payload userId cannot view media — completing without work", {
        jobId: job.id,
        mediaId,
        payloadUserId,
        ownerUserId: row.userId,
      });
      await completeJob(job.id);
      return {
        jobId: job.id,
        mediaId,
        skipped: true,
        skipReason: "Job userId cannot access this media.",
      };
    }
  }

  const actorUserId = payloadUserId ?? row.userId;

  try {
    const result = await processFacesForMedia(mediaId, {
      userId: actorUserId,
      replaceExisting,
    });

    const skipped = result.detection.skipped;
    log("info", "Face processing complete", {
      jobId: job.id,
      mediaId,
      actorUserId,
      skipped,
      skipReason: result.detection.skipReason,
      provider: result.detection.provider,
      detected: result.detection.detectedCount,
      stored: result.detection.stored.length,
      groupedAssigned: result.grouping?.assigned ?? 0,
      groupedCreated: result.grouping?.created ?? 0,
    });

    await completeJob(job.id);
    return {
      jobId: job.id,
      mediaId,
      skipped,
      skipReason: result.detection.skipReason,
      result,
    };
  } catch (error) {
    // Soft policy/auth errors should not burn retries forever.
    if (
      error instanceof FaceDetectionError &&
      (error.step === "policy" ||
        error.step === "auth" ||
        error.step === "input")
    ) {
      log("warn", "Non-retryable face error — completing job", {
        jobId: job.id,
        mediaId,
        step: error.step,
        message: error.message,
      });
      await completeJob(job.id);
      return {
        jobId: job.id,
        mediaId,
        skipped: true,
        skipReason: error.message,
      };
    }
    throw error;
  }
}

export async function drainFaceDetectionJobs(
  limit = 10,
): Promise<{
  processed: ProcessFaceJobResult[];
  failures: { jobId: string; error: string }[];
  reclaimed: number;
}> {
  const reclaimed = await reclaimStaleFaceDetectionJobs();
  if (reclaimed > 0) {
    log("warn", "Reclaimed stale face.detect jobs", { count: reclaimed });
  }

  const processed: ProcessFaceJobResult[] = [];
  const failures: { jobId: string; error: string }[] = [];

  for (let i = 0; i < limit; i++) {
    const job = await claimNextFaceDetectionJob();
    if (!job) break;

    try {
      const result = await processFaceDetectionJob(job);
      processed.push(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown face detection worker error";
      log("error", "Job failed — will retry if attempts remain", {
        jobId: job.id,
        mediaId: job.mediaId,
        attempt: job.attempts,
        maxAttempts: job.maxAttempts,
        error: message,
      });
      await failJob(job.id, message, {
        retryDelayMs: Number(process.env.QUEUE_RETRY_DELAY_MS ?? 30_000),
      });
      logJobFailure(
        LogEvents.facesJobFailed,
        {
          jobId: job.id,
          mediaId: job.mediaId,
          attempt: job.attempts,
          maxAttempts: job.maxAttempts,
        },
        error,
      );
      failures.push({ jobId: job.id, error: message });
    }
  }

  return { processed, failures, reclaimed };
}

export async function runFaceDetectionWorkerLoop(): Promise<void> {
  const intervalMs = Number(process.env.QUEUE_POLL_INTERVAL_MS ?? 5000);
  const batchSize = Number(process.env.QUEUE_BATCH_SIZE ?? 5);

  log("info", "Face detection worker loop starting", {
    intervalMs,
    batchSize,
    faceDetectionEnabled: process.env.FACE_DETECTION_ENABLED ?? "false",
    provider: process.env.FACE_DETECTION_PROVIDER ?? "rekognition",
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
        await drainFaceDetectionJobs(batchSize);
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

  log("info", "Face detection worker loop stopped");
}

async function main() {
  loadEnv({ path: ".env.local", override: true });
  loadEnv({ override: true });

  // Neon TLS often fails on Windows corporate/interceptor certs unless this is set.
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
      "WORKER_ENABLED=false — running a single drain pass instead of the poll loop.",
    );
    const result = await drainFaceDetectionJobs(
      Number(process.env.QUEUE_BATCH_SIZE ?? 10),
    );
    log("info", "Single drain complete", {
      processed: result.processed.length,
      failures: result.failures.length,
      reclaimed: result.reclaimed,
    });
    return;
  }

  await runFaceDetectionWorkerLoop();
}

const isDirectCli =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv.some(
    (arg) =>
      arg.includes("workers/faces") ||
      arg.replace(/\\/g, "/").endsWith("workers/faces.ts"),
  );

if (isDirectCli) {
  main().catch((error) => {
    logger.error("worker.faces", {
      worker: "faces",
      message: "fatal",
      ...errorFields(error),
    });
    process.exit(1);
  });
}
