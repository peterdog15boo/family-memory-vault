/**
 * Plaid connected-accounts sync job processor.
 *
 * Invoke via:
 *   - `npm run worker:plaid` (poll loop)
 *   - POST /api/jobs/plaid (cron / one-shot drain)
 */

import { config as loadEnv } from "dotenv";
import { z } from "zod";
import type { ProcessingJob } from "@/lib/db/schema";
import { syncPlaidItemForUser } from "@/lib/plaid/service";
import {
  claimNextPlaidSyncJob,
  completeJob,
  failJob,
  reclaimStalePlaidSyncJobs,
} from "@/lib/queue";
import { LogEvents, logJobFailure } from "@/lib/observability/events";
import { logger } from "@/lib/observability/logger";

const payloadSchema = z.object({
  userId: z.string().min(1),
  itemId: z.string().min(1),
});

function log(
  level: "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>,
) {
  logger[level]("worker.plaid", {
    worker: "plaid",
    message,
    ...meta,
  });
}

export async function processPlaidSyncJob(
  job: ProcessingJob,
): Promise<{ jobId: string; itemId: string; accountCount: number }> {
  const parsed = payloadSchema.safeParse(job.payload ?? {});
  if (!parsed.success) {
    throw new Error(`Invalid plaid.sync payload: ${parsed.error.message}`);
  }

  const { userId, itemId } = parsed.data;
  const result = await syncPlaidItemForUser(userId, itemId);
  await completeJob(job.id);
  return {
    jobId: job.id,
    itemId,
    accountCount: result.accountCount,
  };
}

export async function drainPlaidSyncJobs(limit = 5): Promise<{
  processed: Array<{ jobId: string; itemId: string; accountCount: number }>;
  failures: Array<{ jobId: string; error: string }>;
  reclaimed: number;
}> {
  const reclaimed = await reclaimStalePlaidSyncJobs();
  const processed: Array<{
    jobId: string;
    itemId: string;
    accountCount: number;
  }> = [];
  const failures: Array<{ jobId: string; error: string }> = [];

  for (let i = 0; i < limit; i += 1) {
    const job = await claimNextPlaidSyncJob();
    if (!job) break;
    try {
      processed.push(await processPlaidSyncJob(job));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await failJob(job.id, message);
      logJobFailure(
        LogEvents.plaidJobFailed,
        {
          jobId: job.id,
          jobType: job.type,
        },
        error,
      );
      failures.push({ jobId: job.id, error: message });
    }
  }

  return { processed, failures, reclaimed };
}

export async function runPlaidWorkerLoop(): Promise<void> {
  const intervalMs = Number(process.env.PLAID_WORKER_INTERVAL_MS ?? 5000);
  const batchSize = Number(process.env.PLAID_WORKER_BATCH_SIZE ?? 5);

  log("info", "Plaid sync worker loop starting", { intervalMs, batchSize });

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
        await drainPlaidSyncJobs(batchSize);
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

  log("info", "Plaid sync worker loop stopped");
}

async function main() {
  loadEnv({ path: ".env.local", override: true });
  loadEnv({ override: true });

  if (
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_INSECURE_TLS === "true"
  ) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  await runPlaidWorkerLoop();
}

const invokedDirectly = process.argv[1]
  ? process.argv.some(
      (arg) =>
        arg.includes("workers/plaid") ||
        arg.replace(/\\/g, "/").endsWith("workers/plaid.ts"),
    )
  : false;

if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
