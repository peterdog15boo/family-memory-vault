/**
 * Award LP / Legacy Guardian milestones after planning checklist changes.
 */

import { getUserFamilies } from "@/lib/families";
import { celebrationFromAward } from "@/lib/gamification/celebration";
import { hookLegacyItemAdded } from "@/lib/gamification/hooks";
import { loadPlanningScore } from "@/lib/legacy/planning";
import type { JourneyCelebrationPayload } from "@/lib/gamification/types";

export async function afterLegacyPlanningChanged(input: {
  userId: string;
  categoryId?: string;
}): Promise<JourneyCelebrationPayload | null> {
  try {
    const [{ score }, families] = await Promise.all([
      loadPlanningScore(input.userId),
      getUserFamilies(input.userId),
    ]);
    const result = await hookLegacyItemAdded({
      userId: input.userId,
      familyId: families[0]?.id ?? null,
      categoryId: input.categoryId,
      legacyScore: score.strengthPercent,
      completedCategories: score.completedCategoryIds,
    });
    if (!result) return null;

    const celebration = await celebrationFromAward(result, "legacy");
    if (!celebration) return null;

    if (celebration.achievements.length) {
      const { queueMajorMilestoneOutreach } = await import(
        "@/lib/celebrations/outreach"
      );
      queueMajorMilestoneOutreach({
        userId: input.userId,
        achievements: celebration.achievements,
        href: "/legacy",
      });
    }

    try {
      const { notifyLegacyMilestone } = await import("@/lib/notifications");
      await notifyLegacyMilestone(input.userId, {
        strengthPercent: score.strengthPercent,
        categoryId: input.categoryId,
        link: "/legacy",
        celebration,
      });
    } catch (error) {
      console.error("[gamification] legacy milestone notification failed", {
        userId: input.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return celebration;
  } catch (error) {
    console.error("[gamification] afterLegacyPlanningChanged failed", {
      userId: input.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
