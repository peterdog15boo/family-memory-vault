/**
 * Read model for the four journey tracks + next milestones.
 */

import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  achievementDefinitions,
  familyProgress,
  userAchievements,
  userProgress,
  type AchievementCategory,
  type AchievementDefinition,
} from "@/lib/db/schema";
import {
  ACHIEVEMENT_CATALOG,
  catalogByCategory,
} from "@/lib/gamification/catalog";
import { reconcilePhotoProgress } from "@/lib/gamification/award";
import type {
  JourneyMilestone,
  JourneyTrack,
  UnlockedAchievement,
  UserJourney,
} from "@/lib/gamification/types";

const TRACK_LABELS: Record<AchievementCategory, string> = {
  photos: "Photos",
  memories: "Memories",
  family: "Family",
  legacy: "Digital Legacy",
};

const TRACK_ORDER: AchievementCategory[] = [
  "photos",
  "memories",
  "family",
  "legacy",
];

function asMilestone(
  def: Pick<
    AchievementDefinition,
    | "id"
    | "key"
    | "title"
    | "description"
    | "threshold"
    | "lpReward"
    | "badgeImage"
    | "unlockFeature"
  >,
): JourneyMilestone {
  return {
    id: def.id,
    key: def.key,
    title: def.title,
    description: def.description,
    threshold: def.threshold,
    lpReward: def.lpReward,
    badgeImage: def.badgeImage,
    unlockFeature: def.unlockFeature,
  };
}

function currentForCategory(
  category: AchievementCategory,
  progress: {
    photoCount: number;
    memoryCount: number;
    familyMembersCount: number;
    invitesSentCount: number;
    activeCircleCount: number;
    legacyScore: number;
  } | null,
): number {
  if (!progress) return 0;
  switch (category) {
    case "photos":
      return progress.photoCount;
    case "memories":
      return progress.memoryCount;
    case "family":
      return Math.max(
        progress.activeCircleCount,
        progress.familyMembersCount,
        progress.invitesSentCount,
      );
    case "legacy":
      return progress.legacyScore;
    default:
      return 0;
  }
}

export async function getUserJourney(userId: string): Promise<UserJourney> {
  try {
    await reconcilePhotoProgress(userId);
  } catch (error) {
    console.error("[gamification] reconcilePhotoProgress failed", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const db = getDb();

  const [progress] = await db
    .select()
    .from(userProgress)
    .where(eq(userProgress.userId, userId))
    .limit(1);

  const familyRow =
    progress?.familyId != null
      ? (
          await db
            .select()
            .from(familyProgress)
            .where(eq(familyProgress.familyId, progress.familyId))
            .limit(1)
        )[0] ?? null
      : null;

  let defs = await db
    .select()
    .from(achievementDefinitions)
    .orderBy(asc(achievementDefinitions.sortOrder));

  if (defs.length === 0) {
    const now = new Date();
    defs = ACHIEVEMENT_CATALOG.map((seed) => ({
      ...seed,
      createdAt: now,
      updatedAt: now,
    }));
  }

  const unlockRows = await db
    .select()
    .from(userAchievements)
    .where(eq(userAchievements.userId, userId));

  const defById = new Map(defs.map((d) => [d.id, d]));
  const missingIds = unlockRows
    .map((u) => u.achievementId)
    .filter((id) => !defById.has(id));
  if (missingIds.length > 0) {
    const extra = await db
      .select()
      .from(achievementDefinitions)
      .where(inArray(achievementDefinitions.id, missingIds));
    for (const row of extra) defById.set(row.id, row);
  }

  const unlockedByCategory = new Map<
    AchievementCategory,
    UnlockedAchievement[]
  >();
  const unlockedIds = new Set<string>();

  for (const row of unlockRows) {
    const def = defById.get(row.achievementId);
    if (!def) continue;
    unlockedIds.add(def.id);
    const item: UnlockedAchievement = {
      id: def.id,
      key: def.key,
      title: def.title,
      description: def.description,
      category: def.category,
      threshold: def.threshold,
      lpReward: def.lpReward,
      badgeImage: def.badgeImage,
      unlockFeature: def.unlockFeature,
      unlockedAt: row.unlockedAt.toISOString(),
    };
    const list = unlockedByCategory.get(def.category) ?? [];
    list.push(item);
    unlockedByCategory.set(def.category, list);
  }

  const tracks: JourneyTrack[] = TRACK_ORDER.map((category) => {
    const catalog =
      defs.filter((d) => d.category === category).length > 0
        ? defs
            .filter((d) => d.category === category)
            .sort((a, b) => a.sortOrder - b.sortOrder || a.threshold - b.threshold)
        : catalogByCategory(category);

    const remaining = catalog
      .filter((d) => !unlockedIds.has(d.id))
      .map(asMilestone)
      .sort((a, b) => a.threshold - b.threshold || a.key.localeCompare(b.key));

    const nextMilestone = remaining[0] ?? null;
    const unlocked = (unlockedByCategory.get(category) ?? []).sort(
      (a, b) => a.threshold - b.threshold,
    );

    return {
      category,
      label: TRACK_LABELS[category],
      current: currentForCategory(category, progress ?? null),
      unit: category === "legacy" ? "percent" : "count",
      nextMilestone,
      unlocked,
      remaining,
    };
  });

  return {
    userId,
    progress: progress ?? null,
    familyProgress: familyRow,
    totalLp: progress?.totalLp ?? 0,
    level: progress?.level ?? 1,
    streakDays: progress?.streakDays ?? 0,
    tracks,
  };
}
