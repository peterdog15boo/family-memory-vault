/**
 * Fingerprint Will Planner answers for “content changed?” checks.
 * Ignores currentStepId so step navigation alone does not demote draft_ready.
 */

import type { WillAnswers } from "@/lib/will-planner/questions";

export function willAnswersContentFingerprint(answers: WillAnswers): string {
  const { currentStepId: _step, ...rest } = answers;
  return JSON.stringify(rest);
}

export function willAnswersContentChanged(
  before: WillAnswers,
  after: WillAnswers,
): boolean {
  return (
    willAnswersContentFingerprint(before) !==
    willAnswersContentFingerprint(after)
  );
}
