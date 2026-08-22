/**
 * On This Day — media from this month/day in prior years.
 * Uses capture date (`taken_at`) when present; otherwise upload `created_at`.
 * Always scoped via getAccessibleMediaFilter (clean/ready + visible owners).
 */

import { and, desc, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { toSafeMediaItem } from "@/lib/media/queries";
import {
  type OnThisDayItem,
  onThisDayMatchesMonthDay,
} from "@/lib/media/on-this-day-shared";
import { getAccessibleMediaFilter } from "@/lib/permissions";

export type { OnThisDayItem } from "@/lib/media/on-this-day-shared";
export {
  groupOnThisDayByYear,
  onThisDayMatchesMonthDay,
} from "@/lib/media/on-this-day-shared";

export type OnThisDayResult = {
  month: number;
  day: number;
  label: string;
  items: OnThisDayItem[];
  years: number[];
};

/** Effective moment timestamp: capture date when known, else upload time. */
export const mediaMomentAtSql = sql`coalesce(${media.takenAt}, ${media.createdAt})`;

function monthDayParts(date: Date): { month: number; day: number; year: number } {
  return {
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    year: date.getUTCFullYear(),
  };
}

function formatOnThisDayLabel(month: number, day: number): string {
  const d = new Date(Date.UTC(2000, month - 1, day));
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Calendar label for today's month/day (UTC), e.g. "August 22". */
export function onThisDayLabelFor(now = new Date()): string {
  const { month, day } = monthDayParts(now);
  return formatOnThisDayLabel(month, day);
}

function resolveMoment(takenAt: Date | null, createdAt: Date): Date {
  return takenAt instanceof Date ? takenAt : createdAt;
}

/**
 * Load clean/ready media visible to the user that happened on this month/day
 * in a prior year (never today’s year — that’s “recent”, not nostalgia).
 */
export async function getOnThisDayForUser(
  userId: string,
  options?: {
    /** Reference day (defaults to now, UTC). */
    now?: Date;
    limit?: number;
  },
): Promise<OnThisDayResult> {
  const now = options?.now ?? new Date();
  const limit = Math.min(Math.max(options?.limit ?? 48, 1), 96);
  const { month, day, year: currentYear } = monthDayParts(now);
  const access = await getAccessibleMediaFilter(userId);
  const db = getDb();

  const rows = await db
    .select({
      id: media.id,
      userId: media.userId,
      type: media.type,
      contentType: media.contentType,
      originalFilename: media.originalFilename,
      createdAt: media.createdAt,
      takenAt: media.takenAt,
      thumbnailKey: media.thumbnailKey,
      processedKey: media.processedKey,
      originalKey: media.originalKey,
      moderationStatus: media.moderationStatus,
      status: media.status,
    })
    .from(media)
    .where(
      and(
        access,
        sql`extract(month from ${mediaMomentAtSql}) = ${month}`,
        sql`extract(day from ${mediaMomentAtSql}) = ${day}`,
        sql`extract(year from ${mediaMomentAtSql}) < ${currentYear}`,
      ),
    )
    .orderBy(desc(mediaMomentAtSql), desc(media.createdAt))
    .limit(limit);

  const items: OnThisDayItem[] = [];
  const yearSet = new Set<number>();

  for (const row of rows) {
    const safe = await toSafeMediaItem(row);
    if (!safe) continue;
    const moment = resolveMoment(row.takenAt, row.createdAt);
    if (!onThisDayMatchesMonthDay(moment, month, day, currentYear)) continue;
    const momentYear = moment.getUTCFullYear();
    yearSet.add(momentYear);
    items.push({
      ...safe,
      momentYear,
      momentAt: moment.toISOString(),
      fromCaptureDate: Boolean(row.takenAt),
    });
  }

  const years = [...yearSet].sort((a, b) => b - a);

  return {
    month,
    day,
    label: formatOnThisDayLabel(month, day),
    items,
    years,
  };
}

/** Lightweight count for dashboard teaser (no signed URLs). */
export async function countOnThisDayForUser(
  userId: string,
  now = new Date(),
): Promise<number> {
  const { month, day, year: currentYear } = monthDayParts(now);
  const access = await getAccessibleMediaFilter(userId);
  const db = getDb();
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(media)
    .where(
      and(
        access,
        sql`extract(month from ${mediaMomentAtSql}) = ${month}`,
        sql`extract(day from ${mediaMomentAtSql}) = ${day}`,
        sql`extract(year from ${mediaMomentAtSql}) < ${currentYear}`,
      ),
    );
  return Number(row?.value ?? 0);
}
