/**
 * “Your First Family Movie” first-session gate.
 *
 * Order of intercepts (handled by callers):
 * 1. This ritual (when flag on + incomplete + zero movies / pending reveal)
 * 2. Combined Beta NDA + Terms acceptance (/legal-agree)
 * 3. Normal app home / vault
 *
 * Eligibility: any signed-in user with no movies who has not completed or
 * skipped the ritual — including existing vaults that only have photos.
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
  /** Existing vault activity — media and/or movies already present. */
  hasVaultActivity: boolean;
  /**
   * Legacy: onboarding.eligible === true (new-account mark).
   * No longer required to enter; kept for diagnostics / older callers.
   */
  eligibleNewUser: boolean;
  /** Explicit opt-out (`onboarding.eligible === false`) or skip stamp. */
  skipped: boolean;
  /** Resume Big Reveal for a movie that finished while the user was away. */
  pendingRevealMovieId: string | null;
};

/**
 * Pure policy check given already-loaded facts (unit-test friendly).
 */
export function evaluateFirstFamilyMovieEligibility(input: {
  flagOn: boolean;
  complete: boolean;
  /** Explicit skip / admin opt-out — never force the ritual. */
  skipped?: boolean;
  eligibleNewUser: boolean;
  mediaCount: number;
  movieCount: number;
  firstFamilyMovieId?: string | null;
  revealSeen?: boolean;
}): FirstFamilyMovieEligibility {
  const hasVaultActivity = input.mediaCount > 0 || input.movieCount > 0;
  const complete = input.complete;
  const enabled = input.flagOn;
  const skipped = input.skipped === true;
  const pendingRevealMovieId =
    !complete &&
    !skipped &&
    !input.revealSeen &&
    typeof input.firstFamilyMovieId === "string" &&
    input.firstFamilyMovieId.trim().length > 0
      ? input.firstFamilyMovieId.trim()
      : null;

  if (!enabled || complete || skipped) {
    return {
      enabled,
      complete,
      shouldEnter: false,
      hasVaultActivity,
      eligibleNewUser: input.eligibleNewUser,
      skipped,
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
      skipped,
      pendingRevealMovieId,
    };
  }

  // Anyone who already has a movie never enters (except pending reveal above).
  if (input.movieCount > 0) {
    return {
      enabled,
      complete,
      shouldEnter: false,
      hasVaultActivity,
      eligibleNewUser: input.eligibleNewUser,
      skipped,
      pendingRevealMovieId: null,
    };
  }

  // Zero movies + not complete/skipped → play once (new or existing accounts).
  // Media alone does not block — existing photo-only vaults still qualify.
  return {
    enabled,
    complete,
    shouldEnter: true,
    hasVaultActivity,
    eligibleNewUser: input.eligibleNewUser,
    skipped,
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
      skipped: false,
      pendingRevealMovieId: null,
    };
  }

  const db = getDb();
  const [user] = await db
    .select({ onboarding: users.onboarding })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const rawOnboarding = user?.onboarding ?? null;
  const state = normalizeOnboardingState(rawOnboarding);
  // `eligible: false` is an explicit opt-out (admin / skip). Missing stays open.
  const skipped = rawOnboarding?.eligible === false;
  const [mediaCount, movieCount] = await Promise.all([
    countUserMedia(userId),
    countUserMovies(userId),
  ]);

  return evaluateFirstFamilyMovieEligibility({
    flagOn,
    complete: isFirstFamilyMovieComplete(state),
    skipped,
    eligibleNewUser: rawOnboarding?.eligible === true,
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

  const raw = (current?.onboarding ?? null) as UserOnboardingState | null;
  const normalized = normalizeOnboardingState(raw);
  // Preserve tri-state `eligible` (true / false / unset) unless the patch sets it.
  // normalizeOnboardingState collapses unset → false, which would wrongly opt people out.
  const next: UserOnboardingState = {
    ...normalized,
    ...patch,
    eligible:
      patch.eligible !== undefined
        ? patch.eligible
        : raw?.eligible === true
          ? true
          : raw?.eligible === false
            ? false
            : undefined,
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
 * Also advances Ava past first-upload / first-movie goals the ritual covered,
 * while leaving username, invite, people, etc. available when still useful.
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
  const [mediaCount, movieCount] = await Promise.all([
    countUserMedia(userId),
    countUserMovies(userId),
  ]);
  const hadUploads = mediaCount > 0;
  const hadMovie =
    movieCount > 0 || Boolean(state.firstFamilyMovieId?.trim());

  await patchOnboarding(userId, {
    firstFamilyMovieCompletedAt: now,
    firstFamilyMovieRevealSeenAt: state.firstFamilyMovieRevealSeenAt ?? now,
    welcomeSeenAt: state.welcomeSeenAt ?? now,
    helperStep: null,
    helperProgress: {
      ...hp,
      welcomeSeen: true,
      // Ritual always covers first-photo / photos-ready when uploads exist.
      ...(hadUploads
        ? {
            photosReadyCelebrated: true,
            ...(mediaCount >= 5 ? { encourageMemoryPrompted: true } : {}),
          }
        : {}),
      // Ritual movie satisfies the first-movie milestone (even if still rendering).
      ...(hadMovie
        ? {
            inviteAfterFirstMovieReady: true,
          }
        : {}),
    },
  });
}

/**
 * Persist a one-time skip so the ritual is never forced again.
 * Sets completion timestamp + eligible:false (explicit opt-out).
 * Stamps photo/movie milestones already earned so Ava won’t re-ask.
 */
export async function markFirstFamilyMovieSkipped(
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
  const [mediaCount, movieCount] = await Promise.all([
    countUserMedia(userId),
    countUserMovies(userId),
  ]);
  const hadUploads = mediaCount > 0;
  const hadMovie =
    movieCount > 0 || Boolean(state.firstFamilyMovieId?.trim());

  await patchOnboarding(userId, {
    eligible: false,
    firstFamilyMovieCompletedAt: now,
    firstFamilyMovieRevealSeenAt: state.firstFamilyMovieRevealSeenAt ?? now,
    helperStep: null,
    helperProgress: {
      ...hp,
      welcomeSeen: true,
      ...(hadUploads
        ? {
            photosReadyCelebrated: true,
            ...(mediaCount >= 5 ? { encourageMemoryPrompted: true } : {}),
          }
        : {}),
      ...(hadMovie ? { inviteAfterFirstMovieReady: true } : {}),
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
