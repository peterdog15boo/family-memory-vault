import { NextResponse } from "next/server";
import { z } from "zod";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { authorizeWorkerRequest } from "@/lib/security/worker-auth";
import { drainSceneAnalysisJobs } from "@/workers/scene";

/**
 * POST /api/jobs/scene
 *
 * Drain pending media.scene jobs from `processing_jobs`.
 * Auth: Bearer WORKER_SECRET / CRON_SECRET (same as faces drain).
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
    `worker:scene:${request.headers.get("x-forwarded-for") ?? "local"}`,
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

  console.info("[api.jobs.scene] Drain starting", { limit });

  try {
    const result = await drainSceneAnalysisJobs(limit);
    console.info("[api.jobs.scene] Drain finished", {
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
        caption: p.result?.caption,
        tags: p.result?.tags?.slice(0, 12),
        objects: p.result?.objects?.slice(0, 12),
        scenes: p.result?.scenes?.slice(0, 8),
        provider: p.result?.provider,
      })),
      failures: result.failures,
      reclaimed: result.reclaimed,
    });
  } catch (error) {
    console.error("[api.jobs.scene] Drain failed", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Scene drain failed",
      },
      { status: 500 },
    );
  }
}
