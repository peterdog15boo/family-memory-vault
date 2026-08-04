/**
 * Movie render job processor.
 *
 * Flow (user → queue → worker):
 *   1. createMovieJob() inserts movies.status=queued and enqueues movie.render
 *   2. This worker claims the job
 *   3. Runs generateMovie() (clean media → frames → ffmpeg → R2 → ready/failed)
 *
 * Invoke via:
 *   - `npm run worker:movies` (poll loop — preferred for longer encodes)
 *   - POST /api/jobs/movies (cron / one-shot drain; may time out on large albums)
 *
 * Resilience:
 *   - Idempotent skip when movie is already ready with an output key
 *   - Stale processing leases are reclaimed
 *   - Non-retryable MovieError (missing media, etc.) completes the queue job
 *   - Transient failures call failJob() for backoff retry
 */

import { config as loadEnv } from "dotenv";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { movies, type Movie, type ProcessingJob } from "@/lib/db/schema";
import { MovieError } from "@/lib/movies/errors";
import {
  generateMovie,
  type GenerateMovieResult,
} from "@/lib/movies/generator";
import { updateMovieStatus } from "@/lib/movies/lifecycle";
import type { MovieSettings } from "@/lib/movies/settings";
import {
  claimNextMovieRenderJob,
  completeJob,
  failJob,
  reclaimStaleMovieRenderJobs,
} from "@/lib/queue";
import { LogEvents, logJobFailure } from "@/lib/observability/events";
import { errorFields, logger } from "@/lib/observability/logger";

const movieJobPayloadSchema = z.object({
  movieId: z.string().min(1),
  memoryId: z.string().min(1),
  userId: z.string().min(1),
  style: z.string().optional(),
  /** Force a re-render even if status is already ready. */
  force: z.boolean().optional(),
});

export type ProcessMovieJobResult = {
  jobId: string;
  movieId: string;
  memoryId: string;
  skipped: boolean;
  skipReason?: string;
  result?: GenerateMovieResult;
};

function log(
  level: "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>,
) {
  logger[level]("worker.movies", {
    worker: "movies",
    message,
    ...meta,
  });
}

function parsePayload(job: ProcessingJob) {
  const parsed = movieJobPayloadSchema.safeParse(job.payload ?? {});
  if (!parsed.success) {
    throw new MovieError(
      `Invalid movie.render job payload: ${parsed.error.message}`,
      { retryable: false },
    );
  }
  return parsed.data;
}

async function loadMovie(movieId: string): Promise<Movie | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(movies)
    .where(eq(movies.id, movieId))
    .limit(1);
  return row ?? null;
}

/**
 * Process one claimed movie.render job.
 * Skips work when the movie is already ready (idempotent).
 */
export async function processMovieRenderJob(
  job: ProcessingJob,
): Promise<ProcessMovieJobResult> {
  const payload = parsePayload(job);
  const { movieId, memoryId, userId, force } = payload;
  const startedAt = Date.now();

  log("info", "Processing job", {
    jobId: job.id,
    attempt: job.attempts,
    maxAttempts: job.maxAttempts,
    movieId,
    memoryId,
    userId,
    force: Boolean(force),
  });

  const movie = await loadMovie(movieId);
  if (!movie) {
    log("warn", "Movie row missing — completing without retry", {
      jobId: job.id,
      movieId,
    });
    await completeJob(job.id);
    return {
      jobId: job.id,
      movieId,
      memoryId,
      skipped: true,
      skipReason: "Movie record not found.",
    };
  }

  if (movie.userId !== userId || movie.memoryId !== memoryId) {
    log("warn", "Payload does not match movie row — completing", {
      jobId: job.id,
      movieId,
      payloadUserId: userId,
      payloadMemoryId: memoryId,
      rowUserId: movie.userId,
      rowMemoryId: movie.memoryId,
    });
    await updateMovieStatus(movieId, "failed", {
      errorMessage: "Movie job payload mismatch.",
    }).catch(() => undefined);
    await completeJob(job.id);
    return {
      jobId: job.id,
      movieId,
      memoryId,
      skipped: true,
      skipReason: "Job payload does not match movie record.",
    };
  }

  // Idempotent: another worker (or prior attempt) already finished.
  if (
    !force &&
    movie.status === "ready" &&
    movie.outputKey &&
    movie.outputKey.trim().length > 0
  ) {
    log("info", "Movie already ready — skipping render", {
      jobId: job.id,
      movieId,
      outputKey: movie.outputKey,
      durationSeconds: movie.durationSeconds,
    });
    await completeJob(job.id);
    return {
      jobId: job.id,
      movieId,
      memoryId,
      skipped: true,
      skipReason: "Movie already ready with output.",
    };
  }

  try {
    const result = await generateMovie({
      movieId,
      memoryId,
      userId,
      style: movie.style,
      settings: movie.settings as MovieSettings | undefined,
      fast:
        process.env.MOVIE_FAST_RENDER === "true" ||
        (typeof movie.settings === "object" &&
          movie.settings !== null &&
          (movie.settings as { qualityMode?: string }).qualityMode === "fast"),
    });

    log("info", "Movie render complete", {
      jobId: job.id,
      movieId,
      outputKey: result.outputKey,
      thumbnailKey: result.thumbnailKey,
      durationSeconds: result.durationSeconds,
      clipCount: result.clipCount,
      width: result.width,
      height: result.height,
      encoder: result.encoder,
      elapsedMs: Date.now() - startedAt,
    });

    await completeJob(job.id);
    return {
      jobId: job.id,
      movieId,
      memoryId,
      skipped: false,
      result,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown movie render error";
    const retryable =
      !(error instanceof MovieError) || error.retryable !== false;

    if (!retryable) {
      log("warn", "Non-retryable movie error — completing job", {
        jobId: job.id,
        movieId,
        error: message,
        elapsedMs: Date.now() - startedAt,
      });
      // generateMovie usually already marked failed; ensure terminal state.
      const latest = await loadMovie(movieId);
      if (latest && latest.status !== "failed" && latest.status !== "ready") {
        await updateMovieStatus(movieId, "failed", {
          errorMessage: message.slice(0, 2000),
        }).catch(() => undefined);
      }
      await completeJob(job.id);
      return {
        jobId: job.id,
        movieId,
        memoryId,
        skipped: true,
        skipReason: message,
      };
    }

    throw error;
  }
}

export async function drainMovieRenderJobs(limit = 2): Promise<{
  processed: ProcessMovieJobResult[];
  failures: { jobId: string; movieId?: string; error: string }[];
  reclaimed: number;
}> {
  const reclaimed = await reclaimStaleMovieRenderJobs();
  if (reclaimed > 0) {
    log("warn", "Reclaimed stale movie.render jobs", { count: reclaimed });
  }

  const processed: ProcessMovieJobResult[] = [];
  const failures: { jobId: string; movieId?: string; error: string }[] = [];

  // Movies are CPU-heavy — keep default batch small.
  const safeLimit = Math.min(Math.max(limit, 1), 5);

  for (let i = 0; i < safeLimit; i++) {
    const job = await claimNextMovieRenderJob();
    if (!job) break;

    const payload = movieJobPayloadSchema.safeParse(job.payload ?? {});
    const movieId = payload.success ? payload.data.movieId : undefined;

    try {
      const result = await processMovieRenderJob(job);
      processed.push(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown movie render worker error";
      log("error", "Job failed — will retry if attempts remain", {
        jobId: job.id,
        movieId,
        attempt: job.attempts,
        maxAttempts: job.maxAttempts,
        error: message,
      });

      const { willRetry } = await failJob(job.id, message, {
        retryDelayMs: Number(
          process.env.MOVIE_QUEUE_RETRY_DELAY_MS ??
            process.env.QUEUE_RETRY_DELAY_MS ??
            45_000,
        ),
      });

      // Only mark the movie row failed when retries are exhausted.
      // Mid-retry failures stay "processing" so the UI keeps polling.
      if (movieId) {
        if (willRetry) {
          await updateMovieStatus(movieId, "processing", {
            errorMessage: `Temporary issue — retrying (${job.attempts}/${job.maxAttempts}): ${message.slice(0, 400)}`,
          }).catch(() => undefined);
        } else {
          await updateMovieStatus(movieId, "failed", {
            errorMessage: message.slice(0, 2000),
          }).catch(() => undefined);
        }
      }

      failures.push({ jobId: job.id, movieId, error: message });
      logJobFailure(
        LogEvents.movieJobFailed,
        {
          jobId: job.id,
          movieId,
          attempt: job.attempts,
          maxAttempts: job.maxAttempts,
          willRetry,
        },
        error,
      );
    }
  }

  return { processed, failures, reclaimed };
}

/**
 * Keep draining until `movieId` is ready/failed (or the queue is empty).
 * Used after Create Movie so a new film isn't left queued behind a backlog
 * when only a single drain(1) would run.
 */
export async function drainUntilMovieTerminal(
  movieId: string,
  options?: { maxJobs?: number },
): Promise<{
  processed: ProcessMovieJobResult[];
  failures: { jobId: string; movieId?: string; error: string }[];
  finalStatus: string | null;
}> {
  const maxJobs = Math.min(Math.max(options?.maxJobs ?? 5, 1), 10);
  const processed: ProcessMovieJobResult[] = [];
  const failures: { jobId: string; movieId?: string; error: string }[] = [];

  for (let i = 0; i < maxJobs; i++) {
    const movie = await loadMovie(movieId);
    if (!movie) {
      return { processed, failures, finalStatus: null };
    }
    if (movie.status === "ready" || movie.status === "failed") {
      return { processed, failures, finalStatus: movie.status };
    }

    const batch = await drainMovieRenderJobs(1);
    processed.push(...batch.processed);
    failures.push(...batch.failures);

    if (batch.processed.length === 0 && batch.failures.length === 0) {
      break;
    }
  }

  const latest = await loadMovie(movieId);
  return {
    processed,
    failures,
    finalStatus: latest?.status ?? null,
  };
}

export async function runMovieRenderWorkerLoop(): Promise<void> {
  const intervalMs = Number(
    process.env.MOVIE_QUEUE_POLL_INTERVAL_MS ??
      process.env.QUEUE_POLL_INTERVAL_MS ??
      5000,
  );
  const batchSize = Number(process.env.MOVIE_QUEUE_BATCH_SIZE ?? 1);

  log("info", "Movie render worker loop starting", {
    intervalMs,
    batchSize,
    envFastRender: process.env.MOVIE_FAST_RENDER === "true",
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
        await drainMovieRenderJobs(batchSize);
      if (processed.length > 0 || failures.length > 0 || reclaimed > 0) {
        log("info", "Batch finished", {
          processed: processed.length,
          failures: failures.length,
          reclaimed,
          ready: processed.filter((p) => !p.skipped && p.result).length,
          skipped: processed.filter((p) => p.skipped).length,
        });
      }
    } catch (error) {
      log("error", "Worker loop iteration failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  log("info", "Movie render worker loop stopped");
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
    const result = await drainMovieRenderJobs(
      Number(process.env.MOVIE_QUEUE_BATCH_SIZE ?? 2),
    );
    log("info", "Single drain complete", {
      processed: result.processed.length,
      failures: result.failures.length,
      reclaimed: result.reclaimed,
    });
    return;
  }

  await runMovieRenderWorkerLoop();
}

const isDirectCli =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv.some(
    (arg) =>
      arg.includes("workers/movies") ||
      arg.replace(/\\/g, "/").endsWith("workers/movies.ts"),
  );

if (isDirectCli) {
  main().catch((error) => {
    logger.error("worker.movies", {
      worker: "movies",
      message: "fatal",
      ...errorFields(error),
    });
    process.exit(1);
  });
}
