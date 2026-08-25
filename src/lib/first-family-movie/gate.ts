/**
 * “Your First Family Movie” first-session gate.
 *
 * Order of intercepts (handled by callers):
 * 1. Beta NDA / Terms
 * 2. This ritual (when flag on + incomplete + eligible / pending reveal)
 * 3. Normal app home
 */

import { count, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { media, movies, users, type UserOnboardingState } from "@/lib/db/schema";
import { normalizeOnboardingState } from "@/lib/ava/onboarding-state";
import {
  isFirstFamilyMovieOnboardingEnabled,
} from "@/lib/first-family-movie/flags";

export {
  isFirstFamilyMovieOnboardingEnabled,
} from "@/lib/first-family-movie/flags";

export function isFirstFamilyMovieComplete(
  state: UserOnboardingState | null | undefined,
): boolean {
  const normalized = normalizeOnboardingState(state);
  return Boolean(normalized.firstFamilyMovieCompletedAt);
}

export type FirstFamilyMovieEligibility = {
  enabled: boolean;
  complete: boolean;
  /** True when this account should enter / stay in the ritual. */
  shouldEnter: boolean;
  /** Existing vault activity — we never force the ritual on these users. */
  hasVaultActivity: boolean;
  eligibleNewUser: boolean;
  /** Resume Big Reveal for a movie that finished while the user was away. */
  pendingRevealMovieId: string | null;
};

/**
 * Pure policy check given already-loaded facts (unit-test friendly).
 */
export function evaluateFirstFamilyMovieEligibility(input: {
  flagOn: boolean;
  complete: boolean;
  eligibleNewUser: boolean;
  mediaCount: number;
  movieCount: number;
  firstFamilyMovieId?: string | null;
  revealSeen?: boolean;
}): FirstFamilyMovieEligibility {
  const hasVaultActivity = input.mediaCount > 0 || input.movieCount > 0;
  const complete = input.complete;
  const enabled = input.flagOn;
  const pendingRevealMovieId =
    !complete &&
    !input.revealSeen &&
    typeof input.firstFamilyMovieId === "string" &&
    input.firstFamilyMovieId.trim().length > 0
      ? input.firstFamilyMovieId.trim()
      : null;

  if (!enabled || complete) {
    return {
      enabled,
      complete,
      shouldEnter: false,
      hasVaultActivity,
      eligibleNewUser: input.eligibleNewUser,
      pendingRevealMovieId: null,
    };
  }

  // Movie finished but theatrical reveal not seen — keep them in the ritual.
  if (pendingRevealMovieId) {
    return {
      enabled,
      complete,
      shouldEnter: true,
      hasVaultActivity,
      eligibleNewUser: input.eligibleNewUser,
      pendingRevealMovieId,
    };
  }

  // Existing active vaults (already had movies): never force.
  if (input.movieCount > 0) {
    return {
      enabled,
      complete,
      shouldEnter: false,
      hasVaultActivity,
      eligibleNewUser: input.eligibleNewUser,
      pendingRevealMovieId: null,
    };
  }

  // Mid-ritual uploads: eligible new users may already have media and must stay.
  if (input.mediaCount > 0 && input.eligibleNewUser !== true) {
    return {
      enabled,
      complete,
      shouldEnter: false,
      hasVaultActivity,
      eligibleNewUser: input.eligibleNewUser,
      pendingRevealMovieId: null,
    };
  }

  const shouldEnter = input.eligibleNewUser === true;

  return {
    enabled,
    complete,
    shouldEnter,
    hasVaultActivity,
    eligibleNewUser: input.eligibleNewUser,
    pendingRevealMovieId: null,
  };
}

async function countUserMedia(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(media)
    .where(eq(media.userId, userId));
  return Number(row?.value ?? 0);
}

async function countUserMovies(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(movies)
    .where(eq(movies.userId, userId));
  return Number(row?.value ?? 0);
}

export async function getFirstFamilyMovieEligibility(
  userId: string,
): Promise<FirstFamilyMovieEligibility> {
  const flagOn = isFirstFamilyMovieOnboardingEnabled();
  if (!flagOn) {
    return {
      enabled: false,
      complete: false,
      shouldEnter: false,
      hasVaultActivity: false,
      eligibleNewUser: false,
      pendingRevealMovieId: null,
    };
  }

  const db = getDb();
  const [user] = await db
    .select({ onboarding: users.onboarding })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const state = normalizeOnboardingState(user?.onboarding);
  const [mediaCount, movieCount] = await Promise.all([
    countUserMedia(userId),
    countUserMovies(userId),
  ]);

  return evaluateFirstFamilyMovieEligibility({
    flagOn,
    complete: isFirstFamilyMovieComplete(state),
    eligibleNewUser: state.eligible === true,
    mediaCount,
    movieCount,
    firstFamilyMovieId: state.firstFamilyMovieId,
    revealSeen: Boolean(state.firstFamilyMovieRevealSeenAt),
  });
}

/** True when the signed-in user should be sent to the ritual instead of home. */
export async function shouldEnterFirstFamilyMovie(
  userId: string,
): Promise<boolean> {
  const eligibility = await getFirstFamilyMovieEligibility(userId);
  return eligibility.shouldEnter;
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
    ...normalizeOnboardingState(current?.onboarding),
    ...patch,
  };

  await db
    .update(users)
    .set({ onboarding: next, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return next;
}

/** Persist the ritual movie id so reveal can resume / deep-link. */
export async function saveFirstFamilyMovieId(
  userId: string,
  movieId: string,
): Promise<void> {
  const id = movieId.trim();
  if (!id) return;
  await patchOnboarding(userId, { firstFamilyMovieId: id });
}

/** Mark that the theatrical reveal was shown / continued. */
export async function markFirstFamilyMovieRevealSeen(
  userId: string,
): Promise<void> {
  const db = getDb();
  const [current] = await db
    .select({ onboarding: users.onboarding })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const state = normalizeOnboardingState(current?.onboarding);
  if (state.firstFamilyMovieRevealSeenAt) return;
  await patchOnboarding(userId, {
    firstFamilyMovieRevealSeenAt: new Date().toISOString(),
  });
}

/** Persist one-time completion so the ritual never runs again.
 * Also advances Ava past first-run goals this ritual already covered
 * so she doesn’t reopen a conflicting welcome / photos / movie tip.
 */
export async function markFirstFamilyMovieComplete(
  userId: string,
): Promise<void> {
  const db = getDb();
  const [current] = await db
    .select({ onboarding: users.onboarding })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const state = normalizeOnboardingState(current?.onboarding);
  if (state.firstFamilyMovieCompletedAt) return;

  const now = new Date().toISOString();
  const hp = state.helperProgress ?? {};
  await patchOnboarding(userId, {
    firstFamilyMovieCompletedAt: now,
    firstFamilyMovieRevealSeenAt: state.firstFamilyMovieRevealSeenAt ?? now,
    welcomeSeenAt: state.welcomeSeenAt ?? now,
    helperStep: null,
    helperProgress: {
      ...hp,
      welcomeSeen: true,
      photosReadyCelebrated: true,
      encourageMemoryPrompted: true,
      memoryCelebrated: true,
      peopleExplained: true,
      inviteAfterFirstMovieReady: true,
      inviteAfterFirstMoviePrompted: true,
    },
  });
}

/**
 * Only stamp complete when the reveal was already seen (or no pending climax).
 * Prevents dumping users into the vault before the theatrical peak.
 */
export async function completeFirstFamilyMovieIfMovieExists(
  userId: string,
): Promise<boolean> {
  const eligibility = await getFirstFamilyMovieEligibility(userId);
  if (eligibility.pendingRevealMovieId) {
    return false;
  }
  const movieCount = await countUserMovies(userId);
  if (movieCount <= 0) return false;
  await markFirstFamilyMovieComplete(userId);
  return true;
}
