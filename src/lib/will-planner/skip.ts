/**
 * Skip logic for Will Planner interview steps.
 */

import {
  hasMinors,
  WILL_STEPS,
  type WillAnswers,
  type WillStepId,
} from "@/lib/will-planner/questions";

export function shouldIncludeStep(
  stepId: WillStepId,
  answers: WillAnswers,
): boolean {
  const packs = answers.packs ?? {};

  switch (stepId) {
    case "guardians":
      return hasMinors(answers);
    case "employee":
      return packs.employee === true;
    case "business":
      return packs.business === true;
    case "investor":
      return packs.investor === true;
    case "crypto":
      return packs.crypto === true;
    case "complexity":
      return packs.complexity === true;
    default:
      return true;
  }
}

/** Ordered step ids after applying skip rules. */
export function visibleWillSteps(answers: WillAnswers): WillStepId[] {
  return WILL_STEPS.filter((s) => shouldIncludeStep(s.id, answers)).map(
    (s) => s.id,
  );
}

export function nextWillStepId(
  current: WillStepId,
  answers: WillAnswers,
): WillStepId | null {
  const visible = visibleWillSteps(answers);
  const idx = visible.indexOf(current);
  if (idx < 0) return visible[0] ?? null;
  return visible[idx + 1] ?? null;
}

export function prevWillStepId(
  current: WillStepId,
  answers: WillAnswers,
): WillStepId | null {
  const visible = visibleWillSteps(answers);
  const idx = visible.indexOf(current);
  if (idx <= 0) return null;
  return visible[idx - 1] ?? null;
}

export function resolveCurrentStepId(answers: WillAnswers): WillStepId {
  const visible = visibleWillSteps(answers);
  const saved = answers.currentStepId as WillStepId | undefined;
  if (saved && visible.includes(saved)) return saved;
  return visible[0] ?? "packs";
}

export function willProgressPercent(
  current: WillStepId,
  answers: WillAnswers,
): number {
  const visible = visibleWillSteps(answers);
  if (visible.length === 0) return 0;
  const idx = Math.max(0, visible.indexOf(current));
  return Math.round(((idx + 1) / visible.length) * 100);
}
