/**
 * Pure helpers for which achievements a counter snapshot unlocks.
 */

import type { AchievementDefinition } from "@/lib/db/schema";
import type { AwardProgressMetadata } from "@/lib/gamification/types";

export type ProgressCounters = {
  photoCount: number;
  memoryCount: number;
  familyMembersCount: number;
  invitesSentCount: number;
  activeCircleCount: number;
  legacyScore: number;
  completedLegacyCategories: ReadonlySet<string>;
};

export function isAchievementMet(
  def: Pick<AchievementDefinition, "category" | "key" | "threshold">,
  counters: ProgressCounters,
): boolean {
  switch (def.category) {
    case "photos":
      return counters.photoCount >= def.threshold;
    case "memories":
      return counters.memoryCount >= def.threshold;
    case "family":
      if (def.key === "family.invite.sent") {
        return counters.invitesSentCount >= def.threshold;
      }
      if (def.key.startsWith("family.builder.")) {
        return counters.familyMembersCount >= def.threshold;
      }
      return counters.activeCircleCount >= def.threshold;
    case "legacy": {
      if (def.key.startsWith("legacy.category.")) {
        const id = def.key.slice("legacy.category.".length);
        return counters.completedLegacyCategories.has(id);
      }
      return counters.legacyScore >= def.threshold;
    }
    default:
      return false;
  }
}

export function countersFromProgress(input: {
  photoCount: number;
  memoryCount: number;
  familyMembersCount: number;
  invitesSentCount?: number;
  activeCircleCount?: number;
  legacyScore: number;
  metadata?: AwardProgressMetadata;
}): ProgressCounters {
  const completed = new Set(input.metadata?.completedCategories ?? []);
  if (input.metadata?.categoryId) {
    completed.add(input.metadata.categoryId);
  }
  return {
    photoCount: input.photoCount,
    memoryCount: input.memoryCount,
    familyMembersCount: input.familyMembersCount,
    invitesSentCount: input.invitesSentCount ?? input.metadata?.invitesSent ?? 0,
    activeCircleCount:
      input.activeCircleCount ?? input.metadata?.contributingMembers ?? 0,
    legacyScore: input.legacyScore,
    completedLegacyCategories: completed,
  };
}
