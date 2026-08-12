/**
 * Canonical achievement catalog. Seeded into `achievement_definitions`.
 */

import type { AchievementCategory } from "@/lib/db/schema";
import type { AchievementSeed } from "@/lib/gamification/types";
import { LEGACY_PLANNING_CATEGORIES } from "@/lib/legacy/planning-categories";

/** Digital Legacy planning categories — gamification + checklist. */
export const LEGACY_CRITICAL_CATEGORIES = LEGACY_PLANNING_CATEGORIES.map(
  (item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
  }),
);

export type LegacyCriticalCategoryId =
  (typeof LEGACY_CRITICAL_CATEGORIES)[number]["id"];

const PHOTO_LADDER = [1, 5, 10, 25, 50, 100, 250, 500, 1000] as const;
const MEMORY_LADDER = [1, 5, 10, 25, 50, 100, 250, 500, 1000] as const;
const FAMILY_LADDER = [1, 3, 5, 10, 15] as const;
const LEGACY_PERCENT_LADDER = [25, 50, 75, 100] as const;

const PHOTO_LP: Record<(typeof PHOTO_LADDER)[number], number> = {
  1: 10,
  5: 25,
  10: 50,
  25: 75,
  50: 100,
  100: 150,
  250: 250,
  500: 400,
  1000: 750,
};

const MEMORY_LP: Record<(typeof MEMORY_LADDER)[number], number> = {
  1: 15,
  5: 30,
  10: 60,
  25: 90,
  50: 120,
  100: 180,
  250: 300,
  500: 450,
  1000: 800,
};

const FAMILY_LP: Record<(typeof FAMILY_LADDER)[number], number> = {
  1: 40,
  3: 60,
  5: 90,
  10: 140,
  15: 200,
};

const LEGACY_PCT_LP: Record<(typeof LEGACY_PERCENT_LADDER)[number], number> = {
  25: 40,
  50: 80,
  75: 120,
  100: 200,
};

const LEGACY_CATEGORY_LP = 30;

const PHOTO_BADGE_NAMES: Record<number, string> = {
  1: "First Snapshot Badge",
  5: "Bronze Keepsake Badge",
  10: "Copper Album Badge",
  25: "Silver Album Badge",
  50: "Gold Album Badge",
  100: "Platinum Album Badge",
  250: "Diamond Album Badge",
  500: "Heirloom Album Badge",
  1000: "Thousand Photos Badge",
};

export function photoBadgeName(threshold: number): string {
  return PHOTO_BADGE_NAMES[threshold] ?? `${threshold} Photos Badge`;
}

function photoTitle(n: number): string {
  return photoBadgeName(n);
}

function photoDescription(n: number): string {
  if (n === 1) return "You added your first family photo. This is how a vault begins.";
  return `Your library now holds ${n} photos, safely kept for family.`;
}

const MEMORY_BADGE_NAMES: Record<number, string> = {
  1: "First Story Badge",
  5: "Bronze Memory Badge",
  10: "Copper Memory Badge",
  25: "Silver Memory Badge",
  50: "Gold Memory Badge",
  100: "Platinum Memory Badge",
  250: "Diamond Memory Badge",
  500: "Heirloom Memory Badge",
  1000: "Thousand Memories Badge",
};

export function memoryBadgeName(threshold: number): string {
  return MEMORY_BADGE_NAMES[threshold] ?? `${threshold} Memories Badge`;
}

function memoryTitle(n: number): string {
  return memoryBadgeName(n);
}

function memoryDescription(n: number): string {
  if (n === 1) {
    return "You saved your first memory — a story, album, film, or compilation.";
  }
  return `You’ve created ${n} memories for the people you love.`;
}

export const FAMILY_CIRCLE_LADDER = FAMILY_LADDER;
export const FAMILY_BUILDER_LADDER = [1, 3, 5, 10] as const;

const FAMILY_BUILDER_LP: Record<(typeof FAMILY_BUILDER_LADDER)[number], number> =
  {
    1: 20,
    3: 35,
    5: 55,
    10: 80,
  };

export function activeCircleBadgeName(threshold: number): string {
  if (threshold === 1) return "Active Circle";
  return `Active Circle · ${threshold}`;
}

export function familyBuilderBadgeName(threshold: number): string {
  if (threshold === 1) return "Family Builder";
  return `Family Builder · ${threshold}`;
}

function familyTitle(n: number): string {
  return activeCircleBadgeName(n);
}

function familyDescription(n: number): string {
  if (n === 1) {
    return "Someone in your family added their first photo or memory. The circle is alive.";
  }
  return `${n} family members have added a photo or memory. The circle is growing.`;
}

function builderDescription(n: number): string {
  if (n === 1) return "Someone you invited joined the family vault.";
  return `${n} people you invited have joined your family vault.`;
}

function ladderRow(input: {
  category: AchievementCategory;
  prefix: string;
  threshold: number;
  title: string;
  description: string;
  lpReward: number;
  sortOrder: number;
  key?: string;
  unlockFeature?: string | null;
  badgeImage?: string | null;
}): AchievementSeed {
  return {
    id: `ach_${input.prefix}_${input.threshold}`,
    key: input.key ?? `${input.category}.${input.threshold}`,
    title: input.title,
    description: input.description,
    category: input.category,
    threshold: input.threshold,
    lpReward: input.lpReward,
    badgeImage: input.badgeImage ?? `/badges/${input.prefix}-${input.threshold}.svg`,
    unlockFeature: input.unlockFeature ?? null,
    sortOrder: input.sortOrder,
  };
}

export const ACHIEVEMENT_CATALOG: readonly AchievementSeed[] = [
  ...PHOTO_LADDER.map((threshold, index) =>
    ladderRow({
      category: "photos",
      prefix: "photos",
      threshold,
      title: photoTitle(threshold),
      description: photoDescription(threshold),
      lpReward: PHOTO_LP[threshold],
      sortOrder: index,
      unlockFeature: threshold >= 100 ? "people_faces_highlight" : null,
    }),
  ),
  ...MEMORY_LADDER.map((threshold, index) =>
    ladderRow({
      category: "memories",
      prefix: "memories",
      threshold,
      title: memoryTitle(threshold),
      description: memoryDescription(threshold),
      lpReward: MEMORY_LP[threshold],
      sortOrder: index,
      unlockFeature: threshold >= 50 ? "cinematic_themes_hint" : null,
    }),
  ),
  ladderRow({
    category: "family",
    prefix: "family_invite",
    threshold: 1,
    key: "family.invite.sent",
    title: "Invitation Sent",
    description: "You invited someone you trust to the family vault.",
    lpReward: 10,
    sortOrder: 0,
  }),
  ...FAMILY_BUILDER_LADDER.map((threshold, index) =>
    ladderRow({
      category: "family",
      prefix: "family_builder",
      threshold,
      key: `family.builder.${threshold}`,
      title: familyBuilderBadgeName(threshold),
      description: builderDescription(threshold),
      lpReward: FAMILY_BUILDER_LP[threshold],
      sortOrder: 1 + index,
    }),
  ),
  ...FAMILY_LADDER.map((threshold, index) =>
    ladderRow({
      category: "family",
      prefix: "family",
      threshold,
      title: familyTitle(threshold),
      description: familyDescription(threshold),
      lpReward: FAMILY_LP[threshold],
      sortOrder: 20 + index,
    }),
  ),
  ...LEGACY_CRITICAL_CATEGORIES.map((item, index) => ({
    id: `ach_legacy_cat_${item.id}`,
    key: `legacy.category.${item.id}`,
    title: item.title,
    description: item.description,
    category: "legacy" as const,
    threshold: 1,
    lpReward: LEGACY_CATEGORY_LP,
    badgeImage: `/badges/legacy-${item.id}.svg`,
    unlockFeature: null,
    sortOrder: index,
  })),
  ...LEGACY_PERCENT_LADDER.map((threshold, index) =>
    ladderRow({
      category: "legacy",
      prefix: "legacy_pct",
      threshold,
      title:
        threshold === 100
          ? "Platinum Legacy Guardian"
          : threshold === 75
            ? "Gold Legacy Guardian"
            : threshold === 50
              ? "Silver Legacy Guardian"
              : "Bronze Legacy Guardian",
      description:
        threshold === 100
          ? "Your Legacy Plan is complete — documents, wishes, and guidance are in place."
          : `You’ve reached ${threshold}% Legacy Strength. Keep filling the checklist.`,
      lpReward: LEGACY_PCT_LP[threshold],
      sortOrder: LEGACY_CRITICAL_CATEGORIES.length + index,
      unlockFeature: threshold === 100 ? "legacy_readiness_complete" : null,
    }),
  ),
];

export function achievementByKey(
  key: string,
): AchievementSeed | undefined {
  return ACHIEVEMENT_CATALOG.find((row) => row.key === key);
}

export function catalogByCategory(
  category: AchievementCategory,
): AchievementSeed[] {
  return ACHIEVEMENT_CATALOG.filter((row) => row.category === category).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
}
