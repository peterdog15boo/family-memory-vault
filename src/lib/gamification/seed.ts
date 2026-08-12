/**
 * Upsert the achievement catalog (idempotent).
 */

import { getDb } from "@/lib/db";
import {
  achievementDefinitions,
  type AchievementDefinition,
} from "@/lib/db/schema";
import { ACHIEVEMENT_CATALOG } from "@/lib/gamification/catalog";

export async function seedAchievements(): Promise<AchievementDefinition[]> {
  const db = getDb();
  const now = new Date();
  const rows: AchievementDefinition[] = [];

  for (const seed of ACHIEVEMENT_CATALOG) {
    const [row] = await db
      .insert(achievementDefinitions)
      .values({
        id: seed.id,
        key: seed.key,
        title: seed.title,
        description: seed.description,
        category: seed.category,
        threshold: seed.threshold,
        lpReward: seed.lpReward,
        badgeImage: seed.badgeImage,
        unlockFeature: seed.unlockFeature,
        sortOrder: seed.sortOrder,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: achievementDefinitions.id,
        set: {
          key: seed.key,
          title: seed.title,
          description: seed.description,
          category: seed.category,
          threshold: seed.threshold,
          lpReward: seed.lpReward,
          badgeImage: seed.badgeImage,
          unlockFeature: seed.unlockFeature,
          sortOrder: seed.sortOrder,
          updatedAt: now,
        },
      })
      .returning();
    if (row) rows.push(row);
  }

  return rows;
}
