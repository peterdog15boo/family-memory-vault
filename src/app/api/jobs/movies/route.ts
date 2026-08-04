import { NextResponse } from "next/server";
import { z } from "zod";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { authorizeWorkerRequest } from "@/lib/security/worker-auth";
import { drainMovieRenderJobs } from "@/workers/movies";

/**
 * POST /api/jobs/movies
 *
 * Drain pending movie.render jobs from `processing_jobs`.
 * Auth: Bearer WORKER_SECRET / CRON_SECRET (same as faces/moderation).
 *
 * Prefer `npm run worker:movies` for longer encodes — serverless may time out.
 */

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z
  .object({
    limit: z.number().int().min(1).max(5).optional(),
  })
  .optional();

export async function POST(request: Request) {
  if (!authorizeWorkerRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = enforceRateLimit(
    `worker:movies:${request.headers.get("x-forwarded-for") ?? "local"}`,
    RATE_LIMITS.workerDrain.limit,
    RATE_LIMITS.workerDrain.windowMs,
  );
  if (limited) return limited;

  let limit = Number(process.env.MOVIE_QUEUE_BATCH_SIZE ?? 1);
  try {
    const json = await request.json().catch(() => undefined);
    const parsed = bodySchema.safeParse(json);
    if (parsed.success && parsed.data?.limit) {
      limit = parsed.data.limit;
    }
  } catch {
    // empty body is fine
  }

  console.info("[api.jobs.movies] Drain starting", { limit });

  try {
    const result = await drainMovieRenderJobs(limit);
    console.info("[api.jobs.movies] Drain finished", {
      processed: result.processed.length,
      failures: result.failures.length,
      reclaimed: result.reclaimed,
    });

    return NextResponse.json({
      ok: true,
      processed: result.processed.map((p) => ({
        jobId: p.jobId,
        movieId: p.movieId,
        memoryId: p.memoryId,
        skipped: p.skipped,
        skipReason: p.skipReason,
        outputKey: p.result?.outputKey,
        durationSeconds: p.result?.durationSeconds,
        clipCount: p.result?.clipCount,
      })),
      failures: result.failures,
      reclaimed: result.reclaimed,
    });
  } catch (error) {
    console.error("[api.jobs.movies] Drain failed", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Movie render drain failed",
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
    worker: "movies",
    queue: "processing_jobs",
    jobType: "movie.render",
    hint: "POST to drain pending movie.render jobs (prefer npm run worker:movies)",
  });
}
