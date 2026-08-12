/**
 * Build a client celebration payload after a successful award.
 */

import { inAppPresentationForKeys } from "@/lib/celebrations/milestones";
import { memoryBadgeName, photoBadgeName } from "@/lib/gamification/catalog";
import { getUserJourney } from "@/lib/gamification/journey";
import type {
  AwardProgressResult,
  JourneyCelebrationPayload,
  JourneyTrackKind,
} from "@/lib/gamification/types";

export async function celebrationFromAward(
  result: AwardProgressResult,
  track: JourneyTrackKind,
): Promise<JourneyCelebrationPayload | null> {
  const unlocks = result.newAchievements.filter((a) => a.category === track);
  const shouldCelebrate = unlocks.length > 0 || result.leveledUp;
  if (!shouldCelebrate) return null;

  const journey = await getUserJourney(result.progress.userId);
  const row = journey.tracks.find((t) => t.category === track);
  const next = row?.nextMilestone ?? null;
  const current =
    track === "photos"
      ? result.progress.photoCount
      : track === "memories"
        ? result.progress.memoryCount
        : track === "legacy"
          ? result.progress.legacyScore
          : result.progress.activeCircleCount ||
            result.progress.familyMembersCount ||
            result.progress.invitesSentCount;
  const badgeName =
    track === "photos"
      ? photoBadgeName
      : track === "memories"
        ? memoryBadgeName
        : null;

  const presentation =
    unlocks.length === 0 && result.leveledUp
      ? ("micro" as const)
      : inAppPresentationForKeys(unlocks.map((a) => a.key));

  return {
    kind:
      unlocks.length > 0 && result.leveledUp
        ? "both"
        : unlocks.length > 0
          ? "achievement"
          : "level_up",
    achievements: unlocks.length > 0 ? unlocks : result.newAchievements,
    previousLevel: result.celebrationPayload.previousLevel,
    newLevel: result.celebrationPayload.newLevel,
    lpGained: result.lpGained,
    track,
    current,
    presentation,
    ...(track === "photos" ? { photoCount: current } : {}),
    nextGoal: next
      ? {
          title: badgeName ? badgeName(next.threshold) : next.title,
          threshold: next.threshold,
          lpReward: next.lpReward,
        }
      : null,
  };
}

export function mergeCelebrations(
  primary: JourneyCelebrationPayload | null,
  extra: JourneyCelebrationPayload | null,
): JourneyCelebrationPayload | null {
  if (!primary) return extra;
  if (!extra) return primary;
  const achievements = [...primary.achievements, ...extra.achievements];
  const leveledUp =
    extra.newLevel > extra.previousLevel ||
    primary.newLevel > primary.previousLevel;
  return {
    ...primary,
    kind:
      achievements.length > 0 && leveledUp
        ? "both"
        : achievements.length > 0
          ? "achievement"
          : leveledUp
            ? "level_up"
            : primary.kind,
    achievements,
    lpGained: primary.lpGained + extra.lpGained,
    newLevel: Math.max(primary.newLevel, extra.newLevel),
    previousLevel: Math.min(primary.previousLevel, extra.previousLevel),
    presentation:
      primary.presentation === "full" || extra.presentation === "full"
        ? "full"
        : (primary.presentation ?? extra.presentation),
  };
}
