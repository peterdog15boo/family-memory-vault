/**
 * Load vault signals used by dormancy + retention tip/email pickers.
 */

import { and, count, eq, max, sql } from "drizzle-orm";
import { getFamilyCompleteness } from "@/lib/completeness/family-completeness";
import { getDb } from "@/lib/db";
import {
  assistantConversations,
  assistantMessages,
  familyChatMessages,
  familyMembers,
  media,
  memories,
  movies,
  people,
  users,
} from "@/lib/db/schema";
import { cleanReadyMediaFilter } from "@/lib/media/queries";
import {
  canUseFamilyTree,
  canUseLegacyPlusFeatures,
} from "@/lib/plans/gates";
import type { RetentionVaultSnapshot } from "@/lib/retention/types";
import { normalizeOnboardingState } from "@/lib/ava/onboarding-state";

export async function loadRetentionVaultSnapshot(
  userId: string,
): Promise<RetentionVaultSnapshot> {
  const db = getDb();
  const now = new Date();

  const [
    [userRow],
    [mediaRow],
    [cleanRow],
    [memoryRow],
    [peopleRow],
    [namedPeopleRow],
    [movieRow],
    [inviteRow],
    [familyOthersRow],
    [chatRow],
    [askAiRow],
    [lastMedia],
    [lastMemory],
    [lastMovie],
    [lastPerson],
  ] = await Promise.all([
    db
      .select({
        createdAt: users.createdAt,
        lastActiveAt: users.lastActiveAt,
        onboarding: users.onboarding,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({ value: count() })
      .from(media)
      .where(eq(media.userId, userId)),
    db
      .select({ value: count() })
      .from(media)
      .where(cleanReadyMediaFilter(userId)),
    db
      .select({ value: count() })
      .from(memories)
      .where(eq(memories.userId, userId)),
    db
      .select({ value: count() })
      .from(people)
      .where(eq(people.userId, userId)),
    db
      .select({ value: count() })
      .from(people)
      .where(
        and(
          eq(people.userId, userId),
          sql`${people.name} is not null`,
          sql`length(trim(${people.name})) > 0`,
          sql`${people.name} !~* '^Person[[:space:]]+[0-9]+$'`,
        ),
      ),
    db
      .select({ value: count() })
      .from(movies)
      .where(eq(movies.userId, userId)),
    db
      .select({ value: count() })
      .from(familyMembers)
      .where(eq(familyMembers.invitedByUserId, userId)),
    db
      .select({ value: sql<number>`1` })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.userId, userId),
          eq(familyMembers.status, "active"),
          sql`exists (
            select 1 from family_members o
            where o.family_id = ${familyMembers.familyId}
              and o.id <> ${familyMembers.id}
              and o.status in ('active', 'pending')
          )`,
        ),
      )
      .limit(1),
    db
      .select({ value: count() })
      .from(familyChatMessages)
      .where(eq(familyChatMessages.senderUserId, userId)),
    db
      .select({ value: count() })
      .from(assistantMessages)
      .innerJoin(
        assistantConversations,
        eq(assistantMessages.conversationId, assistantConversations.id),
      )
      .where(
        and(
          eq(assistantConversations.userId, userId),
          eq(assistantMessages.role, "user"),
        ),
      ),
    db
      .select({ at: max(media.createdAt) })
      .from(media)
      .where(eq(media.userId, userId)),
    db
      .select({ at: max(memories.createdAt) })
      .from(memories)
      .where(eq(memories.userId, userId)),
    db
      .select({ at: max(movies.createdAt) })
      .from(movies)
      .where(eq(movies.userId, userId)),
    db
      .select({ at: max(people.updatedAt) })
      .from(people)
      .where(eq(people.userId, userId)),
  ]);

  const dates = [
    lastMedia?.at,
    lastMemory?.at,
    lastMovie?.at,
    lastPerson?.at,
  ].filter((d): d is Date => d instanceof Date && Number.isFinite(d.getTime()));
  const lastMeaningfulActionAt =
    dates.length > 0
      ? new Date(Math.max(...dates.map((d) => d.getTime())))
      : null;

  const completeness = await getFamilyCompleteness(userId);
  const nextId = completeness.nextAction?.id ?? null;
  const state = normalizeOnboardingState(userRow?.onboarding);
  const stalled = state.helperProgress?.completenessStalled;
  let completenessStalledSince: string | null = null;
  if (nextId && stalled?.id === nextId && stalled.since) {
    completenessStalledSince = stalled.since;
  }

  const createdAt = userRow?.createdAt ?? now;
  const accountAgeDays =
    (now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000);

  const [legacyPlusGate, familyTreeGate] = await Promise.all([
    canUseLegacyPlusFeatures(userId),
    canUseFamilyTree(userId),
  ]);
  const hasLegacyPlus = Boolean(legacyPlusGate.allowed);
  const hasFamilyTree = Boolean(familyTreeGate.allowed);

  const openedSurfaces = state.helperProgress?.retentionOpenedSurfaces ?? [];

  return {
    mediaCount: Number(mediaRow?.value ?? 0),
    cleanUsableMediaCount: Number(cleanRow?.value ?? 0),
    memoryCount: Number(memoryRow?.value ?? 0),
    peopleCount: Number(peopleRow?.value ?? 0),
    namedPeopleCount: Number(namedPeopleRow?.value ?? 0),
    movieCount: Number(movieRow?.value ?? 0),
    hasInvitedFamily: Number(inviteRow?.value ?? 0) > 0,
    hasFamilyWithOthers: Boolean(familyOthersRow),
    hasUsedFamilyChat: Number(chatRow?.value ?? 0) > 0,
    hasUsedAskAi: Number(askAiRow?.value ?? 0) > 0,
    hasOpenedOnThisDay: openedSurfaces.includes("on_this_day"),
    hasLegacyPlus,
    hasFamilyTree,
    accountAgeDays,
    lastActiveAt: userRow?.lastActiveAt ?? null,
    lastMeaningfulActionAt,
    completenessNextId: nextId,
    completenessStalledSince,
  };
}

/** Keep completeness stall stamp in sync (call from Ava progress). */
export async function syncCompletenessStallStamp(
  userId: string,
  nextId: string | null,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ onboarding: users.onboarding })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const state = normalizeOnboardingState(row?.onboarding);
  const prev = state.helperProgress?.completenessStalled;
  if (!nextId) {
    if (!prev) return;
    const next = {
      ...state,
      helperProgress: {
        ...state.helperProgress,
        completenessStalled: null,
      },
    };
    await db
      .update(users)
      .set({ onboarding: next, updatedAt: new Date() })
      .where(eq(users.id, userId));
    return;
  }
  if (prev?.id === nextId && prev.since) return;
  const next = {
    ...state,
    helperProgress: {
      ...state.helperProgress,
      completenessStalled: { id: nextId, since: new Date().toISOString() },
    },
  };
  await db
    .update(users)
    .set({ onboarding: next, updatedAt: new Date() })
    .where(eq(users.id, userId));
}
