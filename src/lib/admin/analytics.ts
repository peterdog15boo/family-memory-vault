/**
 * Admin analytics — simple DB aggregations for the overview dashboard.
 */

import { and, count, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import { assertAdminUser } from "@/lib/auth/admin";
import { formatBytes } from "@/lib/billing/quotas";
import { getDb } from "@/lib/db";
import { families, media, movies, users } from "@/lib/db/schema";
import type { ModerationStatus } from "@/lib/moderation/types";
import { MODERATION_STATUSES } from "@/lib/moderation/types";

export type AdminAnalyticsOverview = {
  generatedAt: Date;
  users: {
    total: number;
    newToday: number;
    new7d: number;
    new30d: number;
    active7d: number;
    active30d: number;
  };
  media: {
    total: number;
    uploadedToday: number;
    uploaded7d: number;
    uploaded30d: number;
    storageBytes: number;
    storageLabel: string;
  };
  movies: {
    total: number;
    ready: number;
    created7d: number;
    created30d: number;
  };
  families: {
    total: number;
    created7d: number;
    created30d: number;
  };
  moderation: Array<{
    status: ModerationStatus;
    count: number;
    percent: number;
  }>;
};

function startOfUtcDay(d = new Date()): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function daysAgo(days: number, from = new Date()): Date {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * High-level product + safety metrics for /admin/analytics.
 */
export async function getAdminAnalyticsOverview(
  actorUserId: string,
): Promise<AdminAnalyticsOverview> {
  await assertAdminUser(actorUserId);

  const db = getDb();
  const now = new Date();
  const today = startOfUtcDay(now);
  const d7 = daysAgo(7, now);
  const d30 = daysAgo(30, now);

  const [
    [userTotal],
    [newToday],
    [new7d],
    [new30d],
    [active7d],
    [active30d],
    [mediaTotal],
    [mediaToday],
    [media7d],
    [media30d],
    [storageRow],
    [moviesTotal],
    [moviesReady],
    [movies7d],
    [movies30d],
    [familiesTotal],
    [families7d],
    [families30d],
    moderationRows,
  ] = await Promise.all([
    db.select({ value: count() }).from(users),
    db
      .select({ value: count() })
      .from(users)
      .where(gte(users.createdAt, today)),
    db
      .select({ value: count() })
      .from(users)
      .where(gte(users.createdAt, d7)),
    db
      .select({ value: count() })
      .from(users)
      .where(gte(users.createdAt, d30)),
    db
      .select({ value: count() })
      .from(users)
      .where(and(isNotNull(users.lastActiveAt), gte(users.lastActiveAt, d7))),
    db
      .select({ value: count() })
      .from(users)
      .where(and(isNotNull(users.lastActiveAt), gte(users.lastActiveAt, d30))),
    db.select({ value: count() }).from(media),
    db
      .select({ value: count() })
      .from(media)
      .where(gte(media.createdAt, today)),
    db
      .select({ value: count() })
      .from(media)
      .where(gte(media.createdAt, d7)),
    db
      .select({ value: count() })
      .from(media)
      .where(gte(media.createdAt, d30)),
    db
      .select({
        bytes: sql<number>`coalesce(sum(${media.byteSize}), 0)`,
      })
      .from(media)
      .where(ne(media.status, "csam_quarantined")),
    db.select({ value: count() }).from(movies),
    db
      .select({ value: count() })
      .from(movies)
      .where(eq(movies.status, "ready")),
    db
      .select({ value: count() })
      .from(movies)
      .where(gte(movies.createdAt, d7)),
    db
      .select({ value: count() })
      .from(movies)
      .where(gte(movies.createdAt, d30)),
    db.select({ value: count() }).from(families),
    db
      .select({ value: count() })
      .from(families)
      .where(gte(families.createdAt, d7)),
    db
      .select({ value: count() })
      .from(families)
      .where(gte(families.createdAt, d30)),
    db
      .select({
        status: media.moderationStatus,
        value: count(),
      })
      .from(media)
      .groupBy(media.moderationStatus),
  ]);

  const modMap = new Map(
    moderationRows.map((r) => [r.status, Number(r.value)]),
  );
  const mediaCount = Number(mediaTotal?.value ?? 0);
  const moderation = MODERATION_STATUSES.map((status) => {
    const c = modMap.get(status) ?? 0;
    return {
      status,
      count: c,
      percent: mediaCount > 0 ? Math.round((c / mediaCount) * 1000) / 10 : 0,
    };
  });

  const storageBytes = Number(storageRow?.bytes ?? 0);

  return {
    generatedAt: now,
    users: {
      total: Number(userTotal?.value ?? 0),
      newToday: Number(newToday?.value ?? 0),
      new7d: Number(new7d?.value ?? 0),
      new30d: Number(new30d?.value ?? 0),
      active7d: Number(active7d?.value ?? 0),
      active30d: Number(active30d?.value ?? 0),
    },
    media: {
      total: mediaCount,
      uploadedToday: Number(mediaToday?.value ?? 0),
      uploaded7d: Number(media7d?.value ?? 0),
      uploaded30d: Number(media30d?.value ?? 0),
      storageBytes,
      storageLabel: formatBytes(storageBytes, 1),
    },
    movies: {
      total: Number(moviesTotal?.value ?? 0),
      ready: Number(moviesReady?.value ?? 0),
      created7d: Number(movies7d?.value ?? 0),
      created30d: Number(movies30d?.value ?? 0),
    },
    families: {
      total: Number(familiesTotal?.value ?? 0),
      created7d: Number(families7d?.value ?? 0),
      created30d: Number(families30d?.value ?? 0),
    },
    moderation,
  };
}
