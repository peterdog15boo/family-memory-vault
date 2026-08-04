import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { media, memoryMedia, movies, processingJobs } from "@/lib/db/schema";
import { cleanReadyMediaFilter } from "@/lib/media/queries";
import { MovieError } from "@/lib/movies/errors";
import {
  countMoviesCreatedThisMonth,
  getUserPlanLimits,
} from "@/lib/plans";

/** Soft daily burst cap (UTC). Override with MOVIE_DAILY_LIMIT. */
export const DEFAULT_MOVIE_DAILY_LIMIT = 10;

export function getMovieDailyLimit(): number {
  const raw = Number(process.env.MOVIE_DAILY_LIMIT ?? DEFAULT_MOVIE_DAILY_LIMIT);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_MOVIE_DAILY_LIMIT;
  return Math.min(Math.floor(raw), 100);
}

function startOfUtcDay(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Count movies created by the user since the start of the current UTC day.
 */
export async function countMoviesCreatedToday(userId: string): Promise<number> {
  const db = getDb();
  const since = startOfUtcDay();
  const [row] = await db
    .select({ value: count() })
    .from(movies)
    .where(and(eq(movies.userId, userId), gte(movies.createdAt, since)));
  return Number(row?.value ?? 0);
}

/**
 * Throw when the user has hit today's movie creation quota (burst protection).
 */
export async function assertWithinMovieDailyQuota(userId: string): Promise<{
  used: number;
  limit: number;
}> {
  const limit = getMovieDailyLimit();
  const used = await countMoviesCreatedToday(userId);
  if (used >= limit) {
    throw new MovieError(
      `Daily movie limit reached (${limit} per day). Try again tomorrow.`,
      { retryable: false, code: "quota_exceeded" },
    );
  }
  return { used, limit };
}

/**
 * Throw when the user has hit their plan's monthly movie limit.
 */
export async function assertWithinMovieMonthlyQuota(userId: string): Promise<{
  used: number;
  limit: number;
}> {
  const limits = await getUserPlanLimits(userId);
  const limit = Math.max(0, limits.maxMoviesPerMonth);
  const used = await countMoviesCreatedThisMonth(userId);
  if (used >= limit) {
    throw new MovieError(
      `You've used all ${limit} movies this month on ${limits.name}. They reset at the start of next month, or you can upgrade for more.`,
      { retryable: false, code: "quota_exceeded" },
    );
  }
  return { used, limit };
}

/**
 * Count clean+ready media linked to a memory (owner-scoped).
 */
export async function countCleanMemoryMedia(
  memoryId: string,
  ownerUserId: string,
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(memoryMedia)
    .innerJoin(media, eq(memoryMedia.mediaId, media.id))
    .where(
      and(
        eq(memoryMedia.memoryId, memoryId),
        cleanReadyMediaFilter(ownerUserId),
      ),
    );
  return Number(row?.value ?? 0);
}

/**
 * How many movie.render jobs are still pending/processing for this user.
 * Soft concurrency guard (in addition to monthly quota).
 */
export async function countActiveMovieJobsForUser(
  userId: string,
): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(processingJobs)
    .where(
      and(
        eq(processingJobs.type, "movie.render"),
        inArray(processingJobs.status, ["pending", "processing"]),
        sql`(${processingJobs.payload}->>'userId') = ${userId}`,
      ),
    );
  return Number(row?.value ?? 0);
}

/** Fallback when plan lookup fails; env can lower the ceiling. */
export const DEFAULT_MOVIE_ACTIVE_JOB_LIMIT = 3;

export function getMovieActiveJobLimitEnvCeiling(): number {
  const raw = Number(
    process.env.MOVIE_ACTIVE_JOB_LIMIT ?? DEFAULT_MOVIE_ACTIVE_JOB_LIMIT,
  );
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_MOVIE_ACTIVE_JOB_LIMIT;
  return Math.min(Math.floor(raw), 20);
}

/** @deprecated Prefer plan-aware assertWithinMovieActiveJobLimit(userId). */
export function getMovieActiveJobLimit(): number {
  return getMovieActiveJobLimitEnvCeiling();
}

export async function assertWithinMovieActiveJobLimit(
  userId: string,
): Promise<void> {
  const limits = await getUserPlanLimits(userId);
  const planLimit = Math.max(1, limits.maxActiveMovieJobs);
  const envCeiling = getMovieActiveJobLimitEnvCeiling();
  const limit = Math.min(planLimit, envCeiling);
  const active = await countActiveMovieJobsForUser(userId);
  if (active >= limit) {
    throw new MovieError(
      `You already have ${active} movie${active === 1 ? "" : "s"} rendering. Wait for one to finish, then try again.`,
      { retryable: false, code: "quota_exceeded" },
    );
  }
}
