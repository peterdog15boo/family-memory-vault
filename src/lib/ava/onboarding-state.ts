/**
 * Shared onboarding JSON normalizer (Ava + legacy checklist).
 * Kept free of media/R2/sharp so `@/lib/onboarding` can import it without
 * circular webpack graphs through `@/lib/ava`.
 */

import type {
  AvaHelperProgress,
  UserOnboardingState,
} from "@/lib/db/schema";

function emptyProgress(): AvaHelperProgress {
  return {};
}

export function normalizeOnboardingState(
  raw: UserOnboardingState | null | undefined,
): UserOnboardingState {
  const progress = raw?.helperProgress ?? emptyProgress();
  return {
    eligible: raw?.eligible === true,
    welcomeSeenAt: raw?.welcomeSeenAt ?? null,
    dismissedAt: raw?.dismissedAt ?? null,
    completedAt: raw?.completedAt ?? null,
    helperEnabled: raw?.helperEnabled !== false,
    helperDismissedAt: raw?.helperDismissedAt ?? null,
    helperStep: raw?.helperStep ?? null,
    screenName: raw?.screenName ?? null,
    avatarMediaId: raw?.avatarMediaId ?? null,
    avatarUrl: raw?.avatarUrl ?? null,
    helperCompletedAt: raw?.helperCompletedAt ?? null,
    helperProgress: {
      welcomeSeen: progress.welcomeSeen === true,
      screenNameSet: progress.screenNameSet === true,
      avatarSet: progress.avatarSet === true,
      avatarSkipped: progress.avatarSkipped === true,
      photosReadyCelebrated: progress.photosReadyCelebrated === true,
      encourageMemoryPrompted: progress.encourageMemoryPrompted === true,
      encourageMemorySkipped: progress.encourageMemorySkipped === true,
      createMemorySkipped: progress.createMemorySkipped === true,
      memoryCelebrated: progress.memoryCelebrated === true,
      peopleExplained: progress.peopleExplained === true,
      peopleSkipped: progress.peopleSkipped === true,
      movieSkipped: progress.movieSkipped === true,
      askAiSkipped: progress.askAiSkipped === true,
      inviteSkipped: progress.inviteSkipped === true,
      inviteAfterFirstMovieReady: progress.inviteAfterFirstMovieReady === true,
      inviteAfterFirstMoviePrompted:
        progress.inviteAfterFirstMoviePrompted === true,
      documentsIntroSeen: progress.documentsIntroSeen === true,
      documentsSkipped: progress.documentsSkipped === true,
      completionCelebrated: progress.completionCelebrated === true,
    },
  };
}
