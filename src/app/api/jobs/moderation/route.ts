import { NextResponse } from "next/server";
import { z } from "zod";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { authorizeWorkerRequest } from "@/lib/security/worker-auth";
import { drainModerationJobs } from "@/workers/moderation";

/**
 * POST /api/jobs/moderation
 *
 * Drain pending moderation jobs from `processing_jobs`.
 * Intended for local cron, Vercel cron, or manual triggering — not end users.
 *
 * Auth: Bearer token must match `WORKER_SECRET` (or `CRON_SECRET`).
 *
 * Body (optional JSON):
 *   { "limit": 10 }
 *
 * Core logic lives in `src/workers/moderation.ts` (DB queue; not CF Queues yet).
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z
  .object({
    limit: z.number().int().min(1).max(50).optional(),
  })
  .optional();

export async function POST(request: Request) {
  if (!authorizeWorkerRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = enforceRateLimit(
    `worker:moderation:${request.headers.get("x-forwarded-for") ?? "local"}`,
    RATE_LIMITS.workerDrain.limit,
    RATE_LIMITS.workerDrain.windowMs,
  );
  if (limited) return limited;

  let limit = Number(process.env.QUEUE_BATCH_SIZE ?? 10);
  try {
    const json = await request.json().catch(() => undefined);
    const parsed = bodySchema.safeParse(json);
    if (parsed.success && parsed.data?.limit) {
      limit = parsed.data.limit;
    }
  } catch {
    // empty body is fine
  }

  console.info("[api.jobs.moderation] Drain starting", { limit });

  try {
    const result = await drainModerationJobs(limit);
    console.info("[api.jobs.moderation] Drain finished", {
      processed: result.processed.length,
      failures: result.failures.length,
      reclaimed: result.reclaimed,
    });

    return NextResponse.json({
      ok: true,
      processed: result.processed.map((p) => ({
        jobId: p.jobId,
        mediaId: p.mediaId,
        skipped: p.skipped,
        skipReason: p.skipReason,
        moderationStatus: p.finalModerationStatus,
        status: p.finalLifecycleStatus,
        decision: p.outcome?.decision.status,
        // ncmecReportId intentionally omitted from HTTP responses
      })),
      failures: result.failures.map((f) => ({
        jobId: f.jobId,
        error: f.error,
      })),
      reclaimed: result.reclaimed,
    });
  } catch (error) {
    console.error("[api.jobs.moderation] Drain failed", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Moderation drain failed",
      },
      { status: 500 },
    );
  }
}

/** Health / discovery */
export async function GET(request: Request) {
  if (!authorizeWorkerRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    worker: "moderation",
    queue: "processing_jobs",
    hint: "POST to drain pending moderation jobs",
  });
}
