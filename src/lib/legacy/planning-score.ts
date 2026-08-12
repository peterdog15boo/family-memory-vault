/**
 * Pure Legacy Planning completeness + strength scoring.
 */

import {
  LEGACY_PLANNING_CATEGORIES,
  LEGACY_PLANNING_DOC_BONUS_RATIO,
  type LegacyPlanningCategoryId,
} from "@/lib/legacy/planning-categories";

export type PlanningCategoryInput = {
  categoryId: LegacyPlanningCategoryId;
  hasFilledItem: boolean;
  hasDocuments: boolean;
};

export type PlanningCategoryScore = {
  categoryId: LegacyPlanningCategoryId;
  title: string;
  weight: number;
  completed: boolean;
  hasDocuments: boolean;
  basePoints: number;
  docBonus: number;
  earned: number;
  max: number;
};

export type PlanningScore = {
  completenessPercent: number;
  strengthPercent: number;
  documentationPercent: number;
  earnedPoints: number;
  maxPoints: number;
  completedCategoryIds: LegacyPlanningCategoryId[];
  nextCategoryId: LegacyPlanningCategoryId | null;
  categories: PlanningCategoryScore[];
};

export function isPlanningItemFilled(input: {
  title?: string | null;
  institution?: string | null;
  notes?: string | null;
  locationHint?: string | null;
  contactName?: string | null;
}): boolean {
  if (!input.title?.trim()) return false;
  return Boolean(
    input.institution?.trim() ||
      input.notes?.trim() ||
      input.locationHint?.trim() ||
      input.contactName?.trim(),
  );
}

export function computePlanningScore(
  rows: PlanningCategoryInput[],
): PlanningScore {
  const byId = new Map(rows.map((r) => [r.categoryId, r]));
  const categories: PlanningCategoryScore[] = LEGACY_PLANNING_CATEGORIES.map(
    (def) => {
      const row = byId.get(def.id);
      const completed = Boolean(row?.hasFilledItem);
      const hasDocuments = Boolean(row?.hasDocuments);
      const docBonusMax = Math.round(def.weight * LEGACY_PLANNING_DOC_BONUS_RATIO);
      const basePoints = completed ? def.weight : 0;
      const docBonus = completed && hasDocuments ? docBonusMax : 0;
      return {
        categoryId: def.id,
        title: def.title,
        weight: def.weight,
        completed,
        hasDocuments,
        basePoints,
        docBonus,
        earned: basePoints + docBonus,
        max: def.weight + docBonusMax,
      };
    },
  );

  const earnedPoints = categories.reduce((sum, c) => sum + c.earned, 0);
  const maxPoints = categories.reduce((sum, c) => sum + c.max, 0);
  const weightTotal = categories.reduce((sum, c) => sum + c.weight, 0);
  const weightEarned = categories.reduce((sum, c) => sum + c.basePoints, 0);
  const completenessPercent =
    weightTotal > 0 ? Math.round((100 * weightEarned) / weightTotal) : 0;
  const docsDone = categories.filter((c) => c.hasDocuments).length;
  const documentationPercent = Math.round(
    (100 * docsDone) / Math.max(1, categories.length),
  );
  const strengthPercent =
    maxPoints > 0
      ? Math.min(100, Math.round((100 * earnedPoints) / maxPoints))
      : 0;
  const completedCategoryIds = categories
    .filter((c) => c.completed)
    .map((c) => c.categoryId);
  const next =
    categories.find((c) => !c.completed) ??
    categories.find((c) => !c.hasDocuments) ??
    null;

  return {
    completenessPercent,
    strengthPercent,
    documentationPercent,
    earnedPoints,
    maxPoints,
    completedCategoryIds,
    nextCategoryId: next?.categoryId ?? null,
    categories,
  };
}
