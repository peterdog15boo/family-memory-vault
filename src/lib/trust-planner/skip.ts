/**
 * Skip logic for Trust Planner interview steps.
 */

import {
  TRUST_STEPS,
  type TrustAnswers,
  type TrustStepId,
} from "@/lib/trust-planner/questions";

export function shouldIncludeTrustStep(
  stepId: TrustStepId,
  answers: TrustAnswers,
): boolean {
  const packs = answers.packs ?? {};

  switch (stepId) {
    case "married":
      return packs.married === true;
    case "real_estate":
      return packs.real_estate === true;
    case "bank_brokerage":
      return packs.bank_brokerage === true;
    case "retirement":
      return packs.retirement === true;
    case "business":
      return packs.business === true;
    case "crypto":
      return packs.crypto === true;
    default:
      return true;
  }
}

export function visibleTrustSteps(answers: TrustAnswers): TrustStepId[] {
  return TRUST_STEPS.filter((s) => shouldIncludeTrustStep(s.id, answers)).map(
    (s) => s.id,
  );
}

export function nextTrustStepId(
  current: TrustStepId,
  answers: TrustAnswers,
): TrustStepId | null {
  const visible = visibleTrustSteps(answers);
  const idx = visible.indexOf(current);
  if (idx < 0) return visible[0] ?? null;
  return visible[idx + 1] ?? null;
}

export function prevTrustStepId(
  current: TrustStepId,
  answers: TrustAnswers,
): TrustStepId | null {
  const visible = visibleTrustSteps(answers);
  const idx = visible.indexOf(current);
  if (idx <= 0) return null;
  return visible[idx - 1] ?? null;
}

export function resolveCurrentTrustStepId(answers: TrustAnswers): TrustStepId {
  const visible = visibleTrustSteps(answers);
  const saved = answers.currentStepId as TrustStepId | undefined;
  if (saved && visible.includes(saved)) return saved;
  return visible[0] ?? "packs";
}

export function trustProgressPercent(
  current: TrustStepId,
  answers: TrustAnswers,
): number {
  const visible = visibleTrustSteps(answers);
  if (visible.length === 0) return 0;
  const idx = Math.max(0, visible.indexOf(current));
  return Math.round(((idx + 1) / visible.length) * 100);
}
