/**
 * Weekly vault digest — highlights + deep links.
 * Respects accessibility filters and per-user email/in-app prefs.
 * Cadence: at most once per ~7 days; empty weeks are skipped.
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { media, movies, users } from "@/lib/db/schema";
import {
  getAccountPreferences,
  resolveAccountPreferences,
  updateAccountPreferences,
  userAllowsEmail,
} from "@/lib/account-preferences";
import { getAccessibleMediaFilter } from "@/lib/permissions";
import { listMemoryLibrary } from "@/lib/memories";
import { getAppUrl } from "@/lib/env";

export type DigestHighlight = {
  kind: "photo" | "memory" | "movie";
  id: string;
  title: string;
  href: string;
};

export type WeeklyDigestPayload = {
  userId: string;
  highlights: DigestHighlight[];
  photoCount: number;
  memoryCount: number;
  movieCount: number;
  photosHref: string;
  memoriesHref: string;
  moviesHref: string;
  onThisDayHref: string;
};

const MIN_DAYS_BETWEEN_DIGESTS = 6;
const LOOKBACK_DAYS = 7;

function daysAgo(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function appPath(path: string): string {
  return `${getAppUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

export function shouldSendWeeklyDigest(input: {
  lastWeeklyDigestAt: string | null | undefined;
  now?: Date;
  /** When true, ignore weekday gate (tests / manual force). */
  force?: boolean;
}): boolean {
  const now = input.now ?? new Date();
  if (!input.force) {
    // Prefer Sundays UTC so cron can run daily without spamming.
    if (now.getUTCDay() !== 0) return false;
  }
  if (!input.lastWeeklyDigestAt) return true;
  const last = new Date(input.lastWeeklyDigestAt).getTime();
  if (!Number.isFinite(last)) return true;
  const elapsedDays = (now.getTime() - last) / (24 * 60 * 60 * 1000);
  return elapsedDays >= MIN_DAYS_BETWEEN_DIGESTS;
}

/**
 * Build digest highlights visible to this user only (no cross-family leakage).
 */
export async function buildWeeklyDigestForUser(
  userId: string,
  options?: { now?: Date },
): Promise<WeeklyDigestPayload | null> {
  const now = options?.now ?? new Date();
  const since = daysAgo(LOOKBACK_DAYS, now);
  const access = await getAccessibleMediaFilter(userId);
  const db = getDb();

  const [photoRows, memoryLibrary, movieRows] = await Promise.all([
    db
      .select({
        id: media.id,
        originalFilename: media.originalFilename,
        createdAt: media.createdAt,
      })
      .from(media)
      .where(and(access, gte(media.createdAt, since)))
      .orderBy(desc(media.createdAt))
      .limit(4),
    listMemoryLibrary(userId, { ownLimit: 4, sharedLimit: 2 }),
    db
      .select({
        id: movies.id,
        title: movies.title,
        memoryId: movies.memoryId,
        completedAt: movies.completedAt,
      })
      .from(movies)
      .where(
        and(
          eq(movies.userId, userId),
          eq(movies.status, "ready"),
          gte(movies.completedAt, since),
        ),
      )
      .orderBy(desc(movies.completedAt))
      .limit(3),
  ]);

  const recentMemories = [...memoryLibrary.own, ...memoryLibrary.shared]
    .filter((m) => {
      const created = new Date(m.createdAt).getTime();
      return Number.isFinite(created) && created >= since.getTime();
    })
    .slice(0, 3);

  const highlights: DigestHighlight[] = [];

  for (const photo of photoRows.slice(0, 3)) {
    highlights.push({
      kind: "photo",
      id: photo.id,
      title: photo.originalFilename?.trim() || "A ready photo",
      href: appPath(`/media?focus=${encodeURIComponent(photo.id)}`),
    });
  }
  for (const memory of recentMemories) {
    highlights.push({
      kind: "memory",
      id: memory.id,
      title: memory.title || "A memory",
      href: appPath(`/memories/${memory.id}`),
    });
  }
  for (const movie of movieRows) {
    highlights.push({
      kind: "movie",
      id: movie.id,
      title: movie.title || "A movie",
      href: appPath(
        movie.memoryId
          ? `/memories/${movie.memoryId}`
          : `/movies`,
      ),
    });
  }

  if (highlights.length === 0) return null;

  return {
    userId,
    highlights,
    photoCount: photoRows.length,
    memoryCount: recentMemories.length,
    movieCount: movieRows.length,
    photosHref: appPath("/media"),
    memoriesHref: appPath("/memories"),
    moviesHref: appPath("/movies"),
    onThisDayHref: appPath("/on-this-day"),
  };
}

export async function stampWeeklyDigestSent(
  userId: string,
  at = new Date(),
): Promise<void> {
  await updateAccountPreferences(userId, {
    lastWeeklyDigestAt: at.toISOString(),
  });
}

/**
 * Deliver one user's digest (email and/or in-app) when eligible.
 * Returns skipped reason or sent channels.
 */
export async function deliverWeeklyDigestForUser(
  userId: string,
  options?: { force?: boolean; now?: Date },
): Promise<{
  sent: boolean;
  skipped?: string;
  email?: boolean;
  inApp?: boolean;
}> {
  const prefs = await getAccountPreferences(userId);
  if (
    !shouldSendWeeklyDigest({
      lastWeeklyDigestAt: prefs.lastWeeklyDigestAt,
      now: options?.now,
      force: options?.force,
    })
  ) {
    return { sent: false, skipped: "cadence" };
  }

  if (!prefs.emailWeeklyDigest && !prefs.inAppWeeklyDigest) {
    return { sent: false, skipped: "prefs_off" };
  }

  const payload = await buildWeeklyDigestForUser(userId, { now: options?.now });
  if (!payload) {
    return { sent: false, skipped: "empty" };
  }

  let emailSent = false;
  let inAppSent = false;

  if (await userAllowsEmail(userId, "weekly_digest")) {
    try {
      const { sendWeeklyDigestEmail } = await import("@/lib/email");
      const { getUserContact } = await import("@/lib/email/lifecycle");
      const contact = await getUserContact(userId);
      if (contact?.email) {
        const result = await sendWeeklyDigestEmail({
          to: contact.email,
          firstName: contact.firstName,
          highlights: payload.highlights,
          photosHref: payload.photosHref,
          memoriesHref: payload.memoriesHref,
          moviesHref: payload.moviesHref,
          onThisDayHref: payload.onThisDayHref,
          photoCount: payload.photoCount,
          memoryCount: payload.memoryCount,
          movieCount: payload.movieCount,
        });
        emailSent = result.ok;
      }
    } catch (error) {
      console.error("[digest] email failed", userId, error);
    }
  }

  if (prefs.inAppWeeklyDigest) {
    try {
      const { notifyWeeklyDigest } = await import("@/lib/notifications");
      const row = await notifyWeeklyDigest(userId, {
        photoCount: payload.photoCount,
        memoryCount: payload.memoryCount,
        movieCount: payload.movieCount,
        link: "/on-this-day",
      });
      inAppSent = Boolean(row);
    } catch (error) {
      console.error("[digest] in-app failed", userId, error);
    }
  }

  if (emailSent || inAppSent) {
    await stampWeeklyDigestSent(userId, options?.now ?? new Date());
    return { sent: true, email: emailSent, inApp: inAppSent };
  }

  return { sent: false, skipped: "delivery_failed" };
}

/**
 * Batch send digests for eligible users (worker / cron).
 */
export async function drainWeeklyDigests(input?: {
  limit?: number;
  force?: boolean;
  now?: Date;
}): Promise<{
  processed: Array<{ userId: string; sent: boolean; skipped?: string }>;
}> {
  const limit = Math.min(Math.max(input?.limit ?? 40, 1), 100);
  const now = input?.now ?? new Date();
  const db = getDb();

  // Active-ish users: have at least one clean/ready media row of their own.
  const candidates = await db
    .select({
      id: users.id,
      accountPreferences: users.accountPreferences,
    })
    .from(users)
    .where(
      sql`exists (
        select 1 from media m
        where m.user_id = ${users.id}
          and m.moderation_status = 'clean'
          and m.status = 'ready'
      )`,
    )
    .orderBy(desc(users.updatedAt))
    .limit(limit * 3);

  const processed: Array<{ userId: string; sent: boolean; skipped?: string }> =
    [];

  for (const user of candidates) {
    if (processed.length >= limit) break;
    const prefs = resolveAccountPreferences(user.accountPreferences);
    if (
      !shouldSendWeeklyDigest({
        lastWeeklyDigestAt: prefs.lastWeeklyDigestAt,
        now,
        force: input?.force,
      })
    ) {
      continue;
    }
    const result = await deliverWeeklyDigestForUser(user.id, {
      force: input?.force,
      now,
    });
    processed.push({
      userId: user.id,
      sent: result.sent,
      skipped: result.skipped,
    });
  }

  return { processed };
}
