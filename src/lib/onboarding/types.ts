/** Shared onboarding types (safe for client components). */

export type OnboardingStepId =
  | "welcome"
  | "upload"
  | "memory"
  | "invite";

export type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  optional: boolean;
  done: boolean;
};

export type OnboardingStateSnapshot = {
  eligible?: boolean;
  welcomeSeenAt?: string | null;
  dismissedAt?: string | null;
  completedAt?: string | null;
};

export type OnboardingProgress = {
  show: boolean;
  firstName: string | null;
  completedCount: number;
  totalCount: number;
  percent: number;
  dismissed: boolean;
  allDone: boolean;
  steps: OnboardingStep[];
  state: OnboardingStateSnapshot;
};
