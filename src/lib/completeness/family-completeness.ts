/**
 * Family Completeness — first-win checklist + next-best-action.
 * Live vault signals only (same honesty model as Ava).
 */

import { and, count, eq, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  familyMembers,
  media,
  movies,
  people,
  privateDocuments,
} from "@/lib/db/schema";
import { cleanReadyMediaFilter } from "@/lib/media/queries";
import { loadPlanningScore } from "@/lib/legacy/planning";
import { canUseLegacyPlusFeatures } from "@/lib/plans/gates";

export const COMPLETENESS_ITEM_IDS = [
  "mediaUploaded",
  "peopleNamed",
  "firstMovie",
  "familyInvited",
  "legacyStarted",
] as const;

export type CompletenessItemId = (typeof COMPLETENESS_ITEM_IDS)[number];

export type CompletenessItem = {
  id: CompletenessItemId;
  done: boolean;
  href: string;
};

export type CompletenessNextAction = {
  id: CompletenessItemId;
  href: string;
};

export type FamilyCompletenessSnapshot = {
  percent: number;
  doneCount: number;
  totalCount: number;
  items: CompletenessItem[];
  nextAction: CompletenessNextAction | null;
  hasLegacyPlus: boolean;
};

/** Pure: first incomplete item in checklist order. */
export function pickCompletenessNextAction(
  items: readonly CompletenessItem[],
): CompletenessNextAction | null {
  for (const item of items) {
    if (!item.done) return { id: item.id, href: item.href };
  }
  return null;
}

/** Pure: percent complete (0–100). */
export function completenessPercent(doneCount: number, totalCount: number): number {
  if (totalCount <= 0) return 0;
  return Math.round((100 * Math.max(0, Math.min(doneCount, totalCount))) / totalCount);
}

async function countCleanReadyMedia(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(media)
    .where(cleanReadyMediaFilter(userId));
  return Number(row?.value ?? 0);
}

/** Named people only — skips auto labels like "Person 3". */
async function countNamedPeople(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(people)
    .where(
      and(
        eq(people.userId, userId),
        sql`${people.name} is not null`,
        sql`length(trim(${people.name})) > 0`,
        sql`${people.name} !~* '^Person[[:space:]]+[0-9]+$'`,
      ),
    );
  return Number(row?.value ?? 0);
}

async function countReadyMovies(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(movies)
    .where(and(eq(movies.userId, userId), eq(movies.status, "ready")));
  return Number(row?.value ?? 0);
}

async function countInvitesSent(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.invitedByUserId, userId),
        or(
          sql`${familyMembers.userId} is null`,
          ne(familyMembers.userId, userId),
        ),
      ),
    );
  return Number(row?.value ?? 0);
}

async function hasLegacyStarted(userId: string): Promise<boolean> {
  const db = getDb();
  const [docRow] = await db
    .select({ value: count() })
    .from(privateDocuments)
    .where(eq(privateDocuments.userId, userId));
  if (Number(docRow?.value ?? 0) > 0) return true;

  try {
    const { score } = await loadPlanningScore(userId);
    return score.completenessPercent > 0 || score.strengthPercent > 0;
  } catch {
    return false;
  }
}

/**
 * Build Family Completeness for the dashboard (Modern).
 */
export async function getFamilyCompleteness(
  userId: string,
): Promise<FamilyCompletenessSnapshot> {
  const [
    mediaCount,
    namedPeople,
    movieCount,
    inviteCount,
    legacyStarted,
    legacyPlusGate,
  ] = await Promise.all([
    countCleanReadyMedia(userId),
    countNamedPeople(userId),
    countReadyMovies(userId),
    countInvitesSent(userId),
    hasLegacyStarted(userId),
    canUseLegacyPlusFeatures(userId).catch(() => ({ allowed: false as const })),
  ]);

  const hasLegacyPlus = Boolean(legacyPlusGate.allowed);
  const legacyHref = hasLegacyPlus ? "/legacy" : "/billing";

  const items: CompletenessItem[] = [
    {
      id: "mediaUploaded",
      done: mediaCount > 0,
      href: "/upload",
    },
    {
      id: "peopleNamed",
      done: namedPeople > 0,
      href: "/people",
    },
    {
      id: "firstMovie",
      done: movieCount > 0,
      href: "/memories?createMovie=1",
    },
    {
      id: "familyInvited",
      done: inviteCount > 0,
      href: "/family",
    },
    {
      id: "legacyStarted",
      done: legacyStarted,
      href: legacyHref,
    },
  ];

  const doneCount = items.filter((i) => i.done).length;
  const totalCount = items.length;

  return {
    percent: completenessPercent(doneCount, totalCount),
    doneCount,
    totalCount,
    items,
    nextAction: pickCompletenessNextAction(items),
    hasLegacyPlus,
  };
}
