/**
 * awardProgress — increment counters, grant LP, unlock badges.
 *
 * Neon HTTP has no interactive transactions; increments use SQL
 * `column + n` upserts + unique unlocks (`ON CONFLICT DO NOTHING`).
 *
 * Photos, memories, and family invites/contributions are wired.
 * Legacy: not wired yet.
 */

import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import {
  achievementDefinitions,
  familyProgress,
  userAchievements,
  userProgress,
  type AchievementDefinition,
  type FamilyProgress,
  type UserProgress,
} from "@/lib/db/schema";
import { ACHIEVEMENT_CATALOG } from "@/lib/gamification/catalog";
import {
  countersFromProgress,
  isAchievementMet,
} from "@/lib/gamification/evaluate";
import {
  EVENT_LP,
  computeStreakDays,
  levelFromLp,
  vaultLevelFromFamily,
} from "@/lib/gamification/levels";
import { countOwnCleanPhotos } from "@/lib/media/queries";
import type {
  AwardProgressEvent,
  AwardProgressResult,
  CelebrationPayload,
  UnlockedAchievement,
} from "@/lib/gamification/types";

function emptyResult(
  userId: string,
  familyId: string | null,
): AwardProgressResult {
  const now = new Date();
  const progress: UserProgress = {
    id: "",
    userId,
    familyId,
    photoCount: 0,
    memoryCount: 0,
    familyMembersCount: 0,
    invitesSentCount: 0,
    activeCircleCount: 0,
    legacyScore: 0,
    totalLp: 0,
    level: 1,
    lastActiveAt: now,
    streakDays: 0,
    createdAt: now,
    updatedAt: now,
  };
  return {
    newAchievements: [],
    lpGained: 0,
    leveledUp: false,
    celebrationPayload: {
      kind: "none",
      achievements: [],
      previousLevel: 1,
      newLevel: 1,
      lpGained: 0,
    },
    progress,
    familyProgress: null,
  };
}

function toUnlocked(
  def: AchievementDefinition,
  unlockedAt: Date,
): UnlockedAchievement {
  return {
    id: def.id,
    key: def.key,
    title: def.title,
    description: def.description,
    category: def.category,
    threshold: def.threshold,
    lpReward: def.lpReward,
    badgeImage: def.badgeImage,
    unlockFeature: def.unlockFeature,
    unlockedAt: unlockedAt.toISOString(),
  };
}

function celebrationOf(
  unlocked: UnlockedAchievement[],
  previousLevel: number,
  newLevel: number,
  lpGained: number,
): CelebrationPayload {
  const leveledUp = newLevel > previousLevel;
  const kind =
    unlocked.length > 0 && leveledUp
      ? "both"
      : unlocked.length > 0
        ? "achievement"
        : leveledUp
          ? "level_up"
          : "none";
  return {
    kind,
    achievements: unlocked,
    previousLevel,
    newLevel,
    lpGained,
  };
}

async function loadDefinitions(): Promise<AchievementDefinition[]> {
  const db = getDb();
  const rows = await db.select().from(achievementDefinitions);
  if (rows.length > 0) return rows;
  const now = new Date();
  return ACHIEVEMENT_CATALOG.map((seed) => ({
    ...seed,
    createdAt: now,
    updatedAt: now,
  }));
}

async function upsertUserProgress(
  event: AwardProgressEvent,
  now: Date,
): Promise<{ row: UserProgress; previousLevel: number }> {
  const db = getDb();
  const familyId = event.familyId ?? null;
  const meta = event.metadata ?? {};
  const eventLp = EVENT_LP[event.type];

  const [existing] = await db
    .select()
    .from(userProgress)
    .where(eq(userProgress.userId, event.userId))
    .limit(1);

  const previousLevel = existing?.level ?? 1;
  const streakDays = computeStreakDays({
    lastActiveAt: existing?.lastActiveAt,
    previousStreak: existing?.streakDays ?? 0,
    now,
  });

  const libraryPhotoCount =
    event.type === "photo_upload"
      ? await countOwnCleanPhotos(event.userId)
      : null;
  const photoDelta = event.type === "photo_upload" ? 1 : 0;
  const memoryDelta = event.type === "memory_create" ? 1 : 0;
  const inviteSentDelta = event.type === "invite_sent" ? 1 : 0;
  const builderDelta = event.type === "invite_accepted" ? 1 : 0;
  const nextCircle =
    event.type === "member_first_contribution" &&
    typeof meta.contributingMembers === "number"
      ? Math.max(0, meta.contributingMembers)
      : null;

  const insertPhoto =
    libraryPhotoCount != null
      ? libraryPhotoCount
      : existing
        ? existing.photoCount
        : photoDelta;
  const insertMemory = existing ? existing.memoryCount : memoryDelta;
  const insertMembers = (existing?.familyMembersCount ?? 0) + builderDelta;
  const insertInvitesSent = (existing?.invitesSentCount ?? 0) + inviteSentDelta;
  const insertCircle = nextCircle ?? existing?.activeCircleCount ?? 0;
  const insertLegacy =
    meta.legacyScore != null
      ? Math.max(0, Math.min(100, Math.round(meta.legacyScore)))
      : (existing?.legacyScore ?? 0);

  const [row] = await db
    .insert(userProgress)
    .values({
      id: existing?.id ?? nanoid(),
      userId: event.userId,
      familyId: familyId ?? existing?.familyId ?? null,
      photoCount: insertPhoto,
      memoryCount: insertMemory,
      familyMembersCount: insertMembers,
      invitesSentCount: insertInvitesSent,
      activeCircleCount: insertCircle,
      legacyScore: insertLegacy,
      totalLp: (existing?.totalLp ?? 0) + eventLp,
      level: levelFromLp((existing?.totalLp ?? 0) + eventLp),
      lastActiveAt: now,
      streakDays,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userProgress.userId,
      set: {
        familyId: familyId ?? sql`${userProgress.familyId}`,
        photoCount:
          libraryPhotoCount != null
            ? libraryPhotoCount
            : photoDelta > 0
              ? sql`${userProgress.photoCount} + ${photoDelta}`
              : sql`${userProgress.photoCount}`,
        memoryCount:
          memoryDelta > 0
            ? sql`${userProgress.memoryCount} + ${memoryDelta}`
            : sql`${userProgress.memoryCount}`,
        familyMembersCount:
          builderDelta > 0
            ? sql`${userProgress.familyMembersCount} + ${builderDelta}`
            : sql`${userProgress.familyMembersCount}`,
        invitesSentCount:
          inviteSentDelta > 0
            ? sql`${userProgress.invitesSentCount} + ${inviteSentDelta}`
            : sql`${userProgress.invitesSentCount}`,
        activeCircleCount:
          nextCircle != null
            ? nextCircle
            : sql`${userProgress.activeCircleCount}`,
        legacyScore:
          meta.legacyScore != null
            ? Math.max(0, Math.min(100, Math.round(meta.legacyScore)))
            : sql`${userProgress.legacyScore}`,
        totalLp: sql`${userProgress.totalLp} + ${eventLp}`,
        lastActiveAt: now,
        streakDays,
        updatedAt: now,
      },
    })
    .returning();

  if (!row) {
    throw new Error("awardProgress: failed to upsert user_progress");
  }

  // Neon HTTP `returning()` can echo the INSERT snapshot, not the conflict
  // update — pin photoCount to the library so badges evaluate the real count.
  if (libraryPhotoCount != null) {
    return {
      row: { ...row, photoCount: libraryPhotoCount },
      previousLevel,
    };
  }

  return { row, previousLevel };
}

async function upsertFamilyProgress(
  event: AwardProgressEvent,
  userLegacyScore: number,
  now: Date,
): Promise<FamilyProgress | null> {
  const familyId = event.familyId;
  if (!familyId) return null;

  const db = getDb();
  const meta = event.metadata ?? {};
  const photoDelta = event.type === "photo_upload" ? 1 : 0;
  const memoryDelta = event.type === "memory_create" ? 1 : 0;

  const [existing] = await db
    .select()
    .from(familyProgress)
    .where(eq(familyProgress.familyId, familyId))
    .limit(1);

  const nextPhotos = (existing?.totalPhotos ?? 0) + photoDelta;
  const nextMemories = (existing?.totalMemories ?? 0) + memoryDelta;
  const nextMembers =
    event.type === "invite_accepted"
      ? (meta.activeMembers ?? (existing?.activeMembers ?? 0) + 1)
      : (existing?.activeMembers ?? 0);
  const nextContributing =
    event.type === "member_first_contribution" &&
    typeof meta.contributingMembers === "number"
      ? Math.max(0, meta.contributingMembers)
      : (existing?.contributingMembers ?? 0);
  const nextLegacyAvg =
    meta.legacyScore != null
      ? Math.round(
          ((existing?.averageLegacyScore ?? 0) +
            Math.max(0, Math.min(100, Math.round(meta.legacyScore)))) /
            (existing ? 2 : 1),
        )
      : (existing?.averageLegacyScore ?? userLegacyScore);
  const vaultLevel = vaultLevelFromFamily({
    totalPhotos: nextPhotos,
    totalMemories: nextMemories,
    activeMembers: nextMembers,
    averageLegacyScore: nextLegacyAvg,
  });

  const [row] = await db
    .insert(familyProgress)
    .values({
      familyId,
      totalPhotos: nextPhotos,
      totalMemories: nextMemories,
      activeMembers: nextMembers,
      contributingMembers: nextContributing,
      averageLegacyScore: nextLegacyAvg,
      vaultLevel,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: familyProgress.familyId,
      set: {
        totalPhotos:
          photoDelta > 0
            ? sql`${familyProgress.totalPhotos} + ${photoDelta}`
            : sql`${familyProgress.totalPhotos}`,
        totalMemories:
          memoryDelta > 0
            ? sql`${familyProgress.totalMemories} + ${memoryDelta}`
            : sql`${familyProgress.totalMemories}`,
        activeMembers:
          event.type === "invite_accepted"
            ? meta.activeMembers != null
              ? meta.activeMembers
              : sql`${familyProgress.activeMembers} + 1`
            : sql`${familyProgress.activeMembers}`,
        contributingMembers:
          event.type === "member_first_contribution" &&
          typeof meta.contributingMembers === "number"
            ? meta.contributingMembers
            : sql`${familyProgress.contributingMembers}`,
        averageLegacyScore: nextLegacyAvg,
        vaultLevel,
        updatedAt: now,
      },
    })
    .returning();

  return row ?? null;
}

async function unlockNewAchievements(input: {
  userId: string;
  familyId: string | null;
  progress: UserProgress;
  metadata: AwardProgressEvent["metadata"];
  now: Date;
}): Promise<{ unlocked: UnlockedAchievement[]; bonusLp: number }> {
  const db = getDb();
  const defs = await loadDefinitions();
  const already = await db
    .select({ achievementId: userAchievements.achievementId })
    .from(userAchievements)
    .where(eq(userAchievements.userId, input.userId));
  const have = new Set(already.map((r) => r.achievementId));

  const counters = countersFromProgress({
    photoCount: input.progress.photoCount,
    memoryCount: input.progress.memoryCount,
    familyMembersCount: input.progress.familyMembersCount,
    invitesSentCount: input.progress.invitesSentCount,
    activeCircleCount: input.progress.activeCircleCount,
    legacyScore: input.progress.legacyScore,
    metadata: input.metadata,
  });

  const candidates = defs.filter(
    (def) => !have.has(def.id) && isAchievementMet(def, counters),
  );

  const unlocked: UnlockedAchievement[] = [];
  let bonusLp = 0;

  for (const def of candidates) {
    const [inserted] = await db
      .insert(userAchievements)
      .values({
        id: nanoid(),
        userId: input.userId,
        achievementId: def.id,
        familyId: input.familyId,
        unlockedAt: input.now,
      })
      .onConflictDoNothing({
        target: [userAchievements.userId, userAchievements.achievementId],
      })
      .returning();

    if (!inserted) continue;
    unlocked.push(toUnlocked(def, inserted.unlockedAt));
    bonusLp += Math.max(0, def.lpReward);
  }

  return { unlocked, bonusLp };
}

/**
 * Apply a vault activity event to the user's journey.
 */
export async function awardProgress(
  event: AwardProgressEvent,
): Promise<AwardProgressResult> {
  if (!event.userId) {
    return emptyResult("", event.familyId ?? null);
  }

  const now = new Date();
  const familyId = event.familyId ?? null;
  const eventLp = EVENT_LP[event.type];

  const { row: afterEvent, previousLevel } = await upsertUserProgress(
    event,
    now,
  );

  const { unlocked, bonusLp } = await unlockNewAchievements({
    userId: event.userId,
    familyId,
    progress: afterEvent,
    metadata: event.metadata,
    now,
  });

  let progress = afterEvent;
  const lpGained = eventLp + bonusLp;
  let leveledUp = progress.level > previousLevel;

  if (bonusLp > 0) {
    const db = getDb();
    const nextLp = progress.totalLp + bonusLp;
    const nextLevel = levelFromLp(nextLp);
    const [updated] = await db
      .update(userProgress)
      .set({
        totalLp: nextLp,
        level: nextLevel,
        updatedAt: now,
      })
      .where(eq(userProgress.userId, event.userId))
      .returning();
    if (updated) progress = updated;
    leveledUp = nextLevel > previousLevel;
  } else {
    const nextLevel = levelFromLp(progress.totalLp);
    if (nextLevel !== progress.level) {
      const db = getDb();
      const [updated] = await db
        .update(userProgress)
        .set({ level: nextLevel, updatedAt: now })
        .where(eq(userProgress.userId, event.userId))
        .returning();
      if (updated) progress = updated;
      leveledUp = nextLevel > previousLevel;
    }
  }

  const familyRow = await upsertFamilyProgress(event, progress.legacyScore, now);

  return {
    newAchievements: unlocked,
    lpGained,
    leveledUp,
    celebrationPayload: celebrationOf(
      unlocked,
      previousLevel,
      progress.level,
      lpGained,
    ),
    progress,
    familyProgress: familyRow,
  };
}

/**
 * Fire-and-forget wrapper for future hook sites. Never throws.
 */
export async function tryAwardProgress(
  event: AwardProgressEvent,
): Promise<AwardProgressResult | null> {
  try {
    return await awardProgress(event);
  } catch (error) {
    console.error("[gamification] awardProgress failed", {
      type: event.type,
      userId: event.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Align photo_count + photo badges with clean/ready library photos.
 * Does not grant per-photo EVENT_LP (those fire on each ready hook).
 */
export async function reconcilePhotoProgress(userId: string): Promise<boolean> {
  if (!userId) return false;

  const actual = await countOwnCleanPhotos(userId);
  const db = getDb();
  const now = new Date();

  const [existing] = await db
    .select()
    .from(userProgress)
    .where(eq(userProgress.userId, userId))
    .limit(1);

  if (!existing && actual === 0) return false;

  let progress = existing;
  if (!existing || existing.photoCount !== actual) {
    const [row] = await db
      .insert(userProgress)
      .values({
        id: existing?.id ?? nanoid(),
        userId,
        familyId: existing?.familyId ?? null,
        photoCount: actual,
        memoryCount: existing?.memoryCount ?? 0,
        familyMembersCount: existing?.familyMembersCount ?? 0,
        invitesSentCount: existing?.invitesSentCount ?? 0,
        activeCircleCount: existing?.activeCircleCount ?? 0,
        legacyScore: existing?.legacyScore ?? 0,
        totalLp: existing?.totalLp ?? 0,
        level: existing?.level ?? 1,
        lastActiveAt: existing?.lastActiveAt ?? now,
        streakDays: existing?.streakDays ?? 0,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userProgress.userId,
        set: {
          photoCount: actual,
          updatedAt: now,
        },
      })
      .returning();
    progress = row ?? existing;
    if (progress) progress = { ...progress, photoCount: actual };
  }

  if (!progress || actual === 0) return existing?.photoCount !== actual;

  const { unlocked, bonusLp } = await unlockNewAchievements({
    userId,
    familyId: progress.familyId,
    progress: { ...progress, photoCount: actual },
    metadata: undefined,
    now,
  });

  if (bonusLp > 0) {
    const nextLp = progress.totalLp + bonusLp;
    await db
      .update(userProgress)
      .set({
        totalLp: nextLp,
        level: levelFromLp(nextLp),
        updatedAt: now,
      })
      .where(eq(userProgress.userId, userId));
  }

  return (
    (existing?.photoCount ?? 0) !== actual || unlocked.length > 0 || bonusLp > 0
  );
}
