/**
 * Pending journey celebrations stored on notification metadata.
 */

import { and, desc, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import type {
  JourneyCelebrationPayload,
  JourneyTrackKind,
} from "@/lib/gamification/types";

const CELEBRATION_TYPES = new Set([
  "media_ready",
  "movie_ready",
  "memory_created",
  "family_milestone",
  "legacy_milestone",
]);

export type PendingJourneyCelebration = {
  notificationId: string;
  celebration: JourneyCelebrationPayload;
};

/** @deprecated Use PendingJourneyCelebration */
export type PendingPhotoCelebration = PendingJourneyCelebration;

function asCelebration(value: unknown): JourneyCelebrationPayload | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Partial<JourneyCelebrationPayload> & {
    photoCount?: number;
  };
  if (!Array.isArray(c.achievements)) return null;
  if (typeof c.lpGained !== "number") return null;
  const track: JourneyTrackKind =
    c.track === "memories"
      ? "memories"
      : c.track === "family"
        ? "family"
        : c.track === "legacy"
          ? "legacy"
          : "photos";
  const current =
    typeof c.current === "number"
      ? c.current
      : typeof c.photoCount === "number"
        ? c.photoCount
        : 0;
  return { ...c, track, current } as JourneyCelebrationPayload;
}

export async function getPendingJourneyCelebration(
  userId: string,
): Promise<PendingJourneyCelebration | null> {
  const db = getDb();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), gte(notifications.createdAt, since)),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(30);

  for (const row of rows) {
    if (!CELEBRATION_TYPES.has(row.type)) continue;
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (meta.celebrationShown === true) continue;
    const celebration = asCelebration(meta.celebration);
    if (!celebration) continue;
    if (celebration.kind === "none" && celebration.achievements.length === 0) {
      continue;
    }
    return { notificationId: row.id, celebration };
  }
  return null;
}

/** @deprecated Use getPendingJourneyCelebration */
export const getPendingPhotoCelebration = getPendingJourneyCelebration;

export async function markJourneyCelebrationShown(
  userId: string,
  notificationId: string,
): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(notifications)
    .where(
      and(eq(notifications.id, notificationId), eq(notifications.userId, userId)),
    )
    .limit(1);
  if (!row) return false;

  const meta = {
    ...((row.metadata ?? {}) as Record<string, unknown>),
    celebrationShown: true,
  };
  await db
    .update(notifications)
    .set({ metadata: meta })
    .where(
      and(eq(notifications.id, notificationId), eq(notifications.userId, userId)),
    );
  return true;
}

/** @deprecated Use markJourneyCelebrationShown */
export const markPhotoCelebrationShown = markJourneyCelebrationShown;
