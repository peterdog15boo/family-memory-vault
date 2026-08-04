import { NextResponse } from "next/server";
import { z } from "zod";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { authorizeWorkerRequest } from "@/lib/security/worker-auth";
import { drainFaceDetectionJobs } from "@/workers/faces";

/**
 * POST /api/jobs/faces
 *
 * Drain pending face.detect jobs from `processing_jobs`.
 * Auth: Bearer WORKER_SECRET / CRON_SECRET (same as moderation drain).
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
    `worker:faces:${request.headers.get("x-forwarded-for") ?? "local"}`,
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

  console.info("[api.jobs.faces] Drain starting", { limit });

  try {
    const result = await drainFaceDetectionJobs(limit);
    console.info("[api.jobs.faces] Drain finished", {
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
        provider: p.result?.detection.provider,
        detected: p.result?.detection.detectedCount,
        stored: p.result?.detection.stored.length,
        assigned: p.result?.grouping?.assigned,
        created: p.result?.grouping?.created,
      })),
      failures: result.failures,
      reclaimed: result.reclaimed,
    });
  } catch (error) {
    console.error("[api.jobs.faces] Drain failed", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Face detection drain failed",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  if (!authorizeWorkerRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    worker: "faces",
    queue: "processing_jobs",
    jobType: "face.detect",
    hint: "POST to drain pending face.detect jobs",
  });
}
