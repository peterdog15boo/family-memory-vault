/**
 * Scene analysis job processor.
 *
 * Runs after media is clean/ready (enqueued from moderation / human review).
 * Uses OpenAI vision (preferred) or Rekognition DetectLabels to fill
 * ai_* / scene_* visual metadata for Ask AI.
 *
 * Invoke via:
 *   - `npm run worker:scene` (poll loop)
 *   - POST /api/jobs/scene (cron / one-shot drain)
 */

import { config as loadEnv } from "dotenv";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { media, type Media, type ProcessingJob } from "@/lib/db/schema";
import {
  processSceneAnalysisForMedia,
} from "@/lib/media/scene";
import type { VisionAnalysisResult } from "@/lib/ai/vision";
import {
  claimNextSceneAnalysisJob,
  completeJob,
  failJob,
  reclaimStaleSceneAnalysisJobs,
} from "@/lib/queue";
import { LogEvents, logJobFailure } from "@/lib/observability/events";
import { errorFields, logger } from "@/lib/observability/logger";

const sceneJobPayloadSchema = z.object({
  mediaId: z.string().min(1).optional(),
  userId: z.string().optional(),
  force: z.boolean().optional(),
});

export type ProcessSceneJobResult = {
  jobId: string;
  mediaId: string;
  skipped: boolean;
  skipReason?: string;
  result?: VisionAnalysisResult;
};

function log(
  level: "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>,
) {
  logger[level]("worker.scene", {
    worker: "scene",
    message,
    ...meta,
  });
}

function resolveMediaId(job: ProcessingJob): string {
  const parsed = sceneJobPayloadSchema.safeParse(job.payload ?? {});
  if (!parsed.success) {
    throw new Error(`Invalid media.scene job payload: ${parsed.error.message}`);
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

export async function processSceneAnalysisJob(
  job: ProcessingJob,
): Promise<ProcessSceneJobResult> {
  const mediaId = resolveMediaId(job);
  const parsed = sceneJobPayloadSchema.safeParse(job.payload ?? {});
  const force = parsed.success ? Boolean(parsed.data.force) : false;
  const payloadUserId = parsed.success ? parsed.data.userId : undefined;

  log("info", "Processing job", {
    jobId: job.id,
    attempt: job.attempts,
    maxAttempts: job.maxAttempts,
    mediaId,
    force,
  });

  const row = await loadMedia(mediaId);
  if (!row) {
    throw new Error(`Media not found for job ${job.id}: ${mediaId}`);
  }

  if (payloadUserId && payloadUserId !== row.userId) {
    log("warn", "Payload userId does not own media — completing without work", {
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
      skipReason: "Job userId does not match media owner.",
    };
  }

  const outcome = await processSceneAnalysisForMedia(mediaId, { force });

  log("info", "Scene analysis complete", {
    jobId: job.id,
    mediaId,
    skipped: outcome.skipped,
    skipReason: outcome.skipReason,
    tags: outcome.result?.tags.slice(0, 8),
    caption: outcome.result?.caption,
    provider: outcome.result?.provider,
  });

  await completeJob(job.id);
  return {
    jobId: job.id,
    mediaId,
    skipped: outcome.skipped,
    skipReason: outcome.skipReason,
    result: outcome.result,
  };
}

export async function drainSceneAnalysisJobs(
  limit = 10,
): Promise<{
  processed: ProcessSceneJobResult[];
  failures: { jobId: string; error: string }[];
  reclaimed: number;
}> {
  const reclaimed = await reclaimStaleSceneAnalysisJobs();
  if (reclaimed > 0) {
    log("warn", "Reclaimed stale media.scene jobs", { count: reclaimed });
  }

  const processed: ProcessSceneJobResult[] = [];
  const failures: { jobId: string; error: string }[] = [];

  for (let i = 0; i < limit; i++) {
    const job = await claimNextSceneAnalysisJob();
    if (!job) break;

    try {
      const result = await processSceneAnalysisJob(job);
      processed.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("error", "Scene job failed", {
        jobId: job.id,
        ...errorFields(error),
      });
      logJobFailure(
        LogEvents.sceneJobFailed,
        {
          jobId: job.id,
          mediaId: job.mediaId,
          attempt: job.attempts,
          maxAttempts: job.maxAttempts,
        },
        error,
      );
      await failJob(job.id, message);
      failures.push({ jobId: job.id, error: message });
    }
  }

  return { processed, failures, reclaimed };
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runSceneAnalysisWorkerLoop(options?: {
  batchSize?: number;
  idleMs?: number;
  enabled?: boolean;
}): Promise<void> {
  const batchSize =
    options?.batchSize ?? Number(process.env.QUEUE_BATCH_SIZE ?? 5);
  const idleMs =
    options?.idleMs ?? Number(process.env.QUEUE_POLL_IDLE_MS ?? 2000);
  const enabled =
    options?.enabled ?? process.env.WORKER_ENABLED !== "false";

  if (!enabled) {
    log("warn", "WORKER_ENABLED=false — scene worker not starting");
    return;
  }

  log("info", "Scene worker loop starting", { batchSize, idleMs });

  for (;;) {
    try {
      const result = await drainSceneAnalysisJobs(batchSize);
      if (result.processed.length === 0 && result.failures.length === 0) {
        await sleep(idleMs);
      }
    } catch (error) {
      log("error", "Scene worker loop error", errorFields(error));
      await sleep(idleMs);
    }
  }
}

async function main() {
  loadEnv({ path: ".env.local" });
  loadEnv();
  await runSceneAnalysisWorkerLoop();
}

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  /scene\.(ts|js|mjs|cjs)$/.test(process.argv[1].replace(/\\/g, "/"));

if (isDirectRun) {
  main().catch((error) => {
    console.error("[worker.scene] Fatal", error);
    process.exit(1);
  });
}
