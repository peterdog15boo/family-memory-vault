/**
 * Dev / test helpers for forcing moderation outcomes without live vendor keys.
 *
 * Prefer these over real CSAM / adult imagery. Never enable force overrides in
 * production unless ALLOW_MODERATION_FORCE=true is set deliberately for a
 * controlled staging environment.
 */

import {
  isModerationStatus,
  type ModerationStatus,
} from "@/lib/moderation/types";

/**
 * Mock scanner scenarios (used when PhotoDNA / AI live flags are off).
 *
 * Aliases:
 *   needs_human_review | human_review → review
 *   violence_review → violence_review
 */
export const MODERATION_MOCK_SCENARIOS = [
  "clean",
  "adult",
  "csam",
  "rejected",
  /** Borderline nudity → needs_human_review */
  "review",
  /** High violence → rejected */
  "violence",
  /** Borderline violence → needs_human_review */
  "violence_review",
] as const;

export type ModerationMockScenario =
  (typeof MODERATION_MOCK_SCENARIOS)[number];

export function getModerationMockScenario(): ModerationMockScenario {
  const raw = process.env.MODERATION_MOCK_SCENARIO?.trim().toLowerCase();
  if (!raw) return "clean";

  if (raw === "needs_human_review" || raw === "human_review") {
    return "review";
  }

  if ((MODERATION_MOCK_SCENARIOS as readonly string[]).includes(raw)) {
    return raw as ModerationMockScenario;
  }

  console.warn(
    `[moderation.mock] Unknown MODERATION_MOCK_SCENARIO="${raw}" — using clean.`,
  );
  return "clean";
}

/**
 * Hard override that skips scanners and applies a final status.
 *
 * Env: MODERATION_FORCE_STATUS=<ModerationStatus>
 * Aliases: review → needs_human_review
 *
 * Never applied when NODE_ENV=production (use dedicated staging with mocks instead).
 */
export function resolveForcedModerationStatus(): ModerationStatus | null {
  const raw = process.env.MODERATION_FORCE_STATUS?.trim().toLowerCase();
  if (!raw) return null;

  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[moderation.force] Ignoring MODERATION_FORCE_STATUS in production.",
    );
    return null;
  }

  const normalized =
    raw === "review" || raw === "human_review"
      ? "needs_human_review"
      : raw;

  if (!isModerationStatus(normalized) || normalized === "pending") {
    console.warn(
      `[moderation.force] Invalid MODERATION_FORCE_STATUS="${raw}" — ignoring.`,
    );
    return null;
  }

  return normalized;
}
