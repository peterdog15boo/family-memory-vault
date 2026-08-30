/**
 * Fingerprint Trust Planner answers for “content changed?” checks.
 * Ignores currentStepId so step navigation alone does not demote draft_ready.
 */

import type { TrustAnswers } from "@/lib/trust-planner/questions";

export function trustAnswersContentFingerprint(answers: TrustAnswers): string {
  const rest = { ...answers };
  delete rest.currentStepId;
  return JSON.stringify(rest);
}

export function trustAnswersContentChanged(
  before: TrustAnswers,
  after: TrustAnswers,
): boolean {
  return (
    trustAnswersContentFingerprint(before) !==
    trustAnswersContentFingerprint(after)
  );
}
