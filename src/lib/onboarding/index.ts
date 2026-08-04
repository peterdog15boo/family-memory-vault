/**
 * New-user onboarding progress.
 *
 * Stored state on users.onboarding: welcomeSeenAt, dismissedAt, completedAt.
 * Step completion for upload / memory / invite is derived from real data
 * so we don't need to mark steps in every write path.
 */

import { and, count, eq, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  familyMembers,
  media,
  memories,
  users,
  type UserOnboardingState,
} from "@/lib/db/schema";
import { normalizeOnboardingState } from "@/lib/ava/onboarding-state";
import type {
  OnboardingProgress,
  OnboardingStep,
} from "@/lib/onboarding/types";

export type {
  OnboardingProgress,
  OnboardingStep,
  OnboardingStepId,
  OnboardingStateSnapshot,
} from "@/lib/onboarding/types";

function normalizeState(
  raw: UserOnboardingState | null | undefined,
): UserOnboardingState {
  return normalizeOnboardingState(raw);
}

async function countUserMedia(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(media)
    .where(eq(media.userId, userId));
  return Number(row?.value ?? 0);
}

async function countUserMemories(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(memories)
    .where(eq(memories.userId, userId));
  return Number(row?.value ?? 0);
}

/** Invites this user sent to someone else (pending or accepted). */
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
          sql`${familyMembers.userId} <> ${userId}`,
        ),
      ),
    );
  return Number(row?.value ?? 0);
}

/**
 * Snapshot of onboarding for the dashboard checklist.
 */
export async function getOnboardingProgress(
  userId: string,
): Promise<OnboardingProgress> {
  const db = getDb();
  const [user] = await db
    .select({
      displayName: users.displayName,
      onboarding: users.onboarding,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const state = normalizeState(user?.onboarding);
  const firstName = user?.displayName?.trim().split(/\s+/)[0] || null;

  const [mediaCount, memoryCount, inviteCount] = await Promise.all([
    countUserMedia(userId),
    countUserMemories(userId),
    countInvitesSent(userId),
  ]);

  const steps: OnboardingStep[] = [
    {
      id: "welcome",
      title: "Welcome to your vault",
      description: "A private, family-safe place for photos and memories.",
      href: "/dashboard",
      ctaLabel: "Got it",
      optional: false,
      done: Boolean(state.welcomeSeenAt),
    },
    {
      id: "upload",
      title: "Upload your first photos",
      description: "Add a few pictures — they're checked for safety first.",
      href: "/upload",
      ctaLabel: "Upload photos",
      optional: false,
      done: mediaCount > 0,
    },
    {
      id: "memory",
      title: "Create a memory",
      description: "Gather photos into an album or story you can revisit.",
      href: "/memories/new",
      ctaLabel: "Create memory",
      optional: true,
      done: memoryCount > 0,
    },
    {
      id: "invite",
      title: "Invite family",
      description: "Share the vault with someone you trust — optional.",
      href: "/family",
      ctaLabel: "Invite someone",
      optional: true,
      done: inviteCount > 0,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const totalCount = steps.length;
  const allDone = completedCount === totalCount;
  /** Key path: welcome acknowledged + at least one upload. */
  const keyStepsDone =
    Boolean(state.welcomeSeenAt) && mediaCount > 0;
  const dismissed = Boolean(state.dismissedAt);

  // Existing accounts (no eligible flag) never see the checklist.
  const isEligible =
    state.eligible === true ||
    Boolean(state.welcomeSeenAt) ||
    Boolean(state.dismissedAt) ||
    Boolean(state.completedAt);

  if ((keyStepsDone || allDone) && !state.completedAt && !dismissed && isEligible) {
    void markOnboardingCompleted(userId).catch(() => undefined);
  }

  const show =
    isEligible &&
    !dismissed &&
    !state.completedAt &&
    !keyStepsDone &&
    // Ava replaces the dashboard checklist for new users.
    state.helperEnabled === false;

  return {
    show,
    firstName,
    completedCount,
    totalCount,
    percent: Math.round((completedCount / totalCount) * 100),
    dismissed,
    allDone: allDone || keyStepsDone || Boolean(state.completedAt),
    steps,
    state,
  };
}

async function patchOnboarding(
  userId: string,
  patch: Partial<UserOnboardingState>,
): Promise<UserOnboardingState> {
  const db = getDb();
  const [current] = await db
    .select({ onboarding: users.onboarding })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const next: UserOnboardingState = {
    ...normalizeState(current?.onboarding),
    ...patch,
  };

  await db
    .update(users)
    .set({ onboarding: next, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return next;
}

export async function markWelcomeSeen(userId: string): Promise<void> {
  const db = getDb();
  const [current] = await db
    .select({ onboarding: users.onboarding })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const state = normalizeState(current?.onboarding);
  if (state.welcomeSeenAt) return;
  await patchOnboarding(userId, { welcomeSeenAt: new Date().toISOString() });
}

export async function dismissOnboarding(userId: string): Promise<void> {
  await patchOnboarding(userId, {
    dismissedAt: new Date().toISOString(),
  });
}

export async function markOnboardingCompleted(userId: string): Promise<void> {
  const db = getDb();
  const [current] = await db
    .select({ onboarding: users.onboarding })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const state = normalizeState(current?.onboarding);
  if (state.completedAt) return;
  await patchOnboarding(userId, {
    completedAt: new Date().toISOString(),
    welcomeSeenAt: state.welcomeSeenAt ?? new Date().toISOString(),
  });
}
