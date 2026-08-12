import { describe, expect, it } from "vitest";
import {
  ACHIEVEMENT_CATALOG,
  LEGACY_CRITICAL_CATEGORIES,
  catalogByCategory,
  memoryBadgeName,
  photoBadgeName,
} from "@/lib/gamification/catalog";
import { memoriesSnapshotFromJourney } from "@/lib/gamification/photos-snapshot";
import type { UserJourney } from "@/lib/gamification/types";
import {
  countersFromProgress,
  isAchievementMet,
} from "@/lib/gamification/evaluate";
import {
  computeStreakDays,
  EVENT_LP,
  levelFromLp,
  lpIntoCurrentLevel,
  vaultLevelFromFamily,
} from "@/lib/gamification/levels";
import {
  memoryKeeperTitle,
  recommendNextAction,
} from "@/lib/gamification/journey-board";
import type { JourneyTrack } from "@/lib/gamification/types";

describe("achievement catalog", () => {
  it("seeds photo, memory, family, and legacy ladders", () => {
    const photos = catalogByCategory("photos").map((a) => a.threshold);
    const memories = catalogByCategory("memories").map((a) => a.threshold);
    const family = catalogByCategory("family");
    const legacy = catalogByCategory("legacy");

    expect(photos).toEqual([1, 5, 10, 25, 50, 100, 250, 500, 1000]);
    expect(photoBadgeName(25)).toBe("Silver Album Badge");
    expect(memoryBadgeName(1)).toBe("First Story Badge");
    expect(memoryBadgeName(25)).toBe("Silver Memory Badge");
    expect(memories).toEqual([1, 5, 10, 25, 50, 100, 250, 500, 1000]);
    expect(family.some((a) => a.key === "family.invite.sent")).toBe(true);
    expect(
      family.filter((a) => a.key.startsWith("family.builder.")).map((a) => a.threshold),
    ).toEqual([1, 3, 5, 10]);
    expect(
      family.filter((a) => /^family\.\d+$/.test(a.key)).map((a) => a.threshold),
    ).toEqual([1, 3, 5, 10, 15]);
    expect(legacy.filter((a) => a.key.startsWith("legacy.category.")).length).toBe(
      LEGACY_CRITICAL_CATEGORIES.length,
    );
    expect(LEGACY_CRITICAL_CATEGORIES).toHaveLength(9);
    expect(
      legacy.filter((a) => a.key.startsWith("legacy.") && !a.key.includes("category")),
    ).toHaveLength(4);
    expect(legacy.find((a) => a.key === "legacy.25")?.title).toBe(
      "Bronze Legacy Guardian",
    );
    expect(legacy.find((a) => a.key === "legacy.50")?.title).toBe(
      "Silver Legacy Guardian",
    );
    expect(legacy.find((a) => a.key === "legacy.75")?.title).toBe(
      "Gold Legacy Guardian",
    );
    expect(legacy.find((a) => a.key === "legacy.100")?.title).toBe(
      "Platinum Legacy Guardian",
    );
    expect(ACHIEVEMENT_CATALOG.map((a) => a.id)).toEqual(
      [...new Set(ACHIEVEMENT_CATALOG.map((a) => a.id))],
    );
    expect(ACHIEVEMENT_CATALOG.map((a) => a.key)).toEqual(
      [...new Set(ACHIEVEMENT_CATALOG.map((a) => a.key))],
    );
  });
});

describe("levels + streak", () => {
  it("starts at level 1 and climbs every 100 LP", () => {
    expect(levelFromLp(0)).toBe(1);
    expect(levelFromLp(99)).toBe(1);
    expect(levelFromLp(100)).toBe(2);
    expect(levelFromLp(250)).toBe(3);
    expect(lpIntoCurrentLevel(250)).toMatchObject({
      level: 3,
      lpInLevel: 50,
      lpToNext: 50,
    });
    expect(memoryKeeperTitle(4)).toBe("Memory Keeper");
  });

  it("awards event LP for each activity type", () => {
    expect(EVENT_LP.photo_upload).toBeGreaterThan(0);
    expect(EVENT_LP.memory_create).toBeGreaterThan(EVENT_LP.photo_upload);
  });

  it("computes family vault level from household activity", () => {
    expect(
      vaultLevelFromFamily({
        totalPhotos: 0,
        totalMemories: 0,
        activeMembers: 0,
        averageLegacyScore: 0,
      }),
    ).toBe(1);
    expect(
      vaultLevelFromFamily({
        totalPhotos: 20,
        totalMemories: 4,
        activeMembers: 3,
        averageLegacyScore: 50,
      }),
    ).toBeGreaterThan(1);
  });

  it("continues a streak across consecutive UTC days", () => {
    const now = new Date("2026-08-09T18:00:00.000Z");
    expect(
      computeStreakDays({
        lastActiveAt: new Date("2026-08-08T12:00:00.000Z"),
        previousStreak: 3,
        now,
      }),
    ).toBe(4);
    expect(
      computeStreakDays({
        lastActiveAt: new Date("2026-08-09T01:00:00.000Z"),
        previousStreak: 3,
        now,
      }),
    ).toBe(3);
    expect(
      computeStreakDays({
        lastActiveAt: new Date("2026-08-01T12:00:00.000Z"),
        previousStreak: 9,
        now,
      }),
    ).toBe(1);
  });
});

describe("achievement evaluation", () => {
  it("unlocks count ladders and legacy category + percent keys", () => {
    const counters = countersFromProgress({
      photoCount: 10,
      memoryCount: 1,
      familyMembersCount: 3,
      invitesSentCount: 1,
      activeCircleCount: 3,
      legacyScore: 50,
      metadata: { completedCategories: ["banking", "contacts"] },
    });

    expect(
      isAchievementMet(
        { category: "photos", key: "photos.1", threshold: 1 },
        countersFromProgress({
          photoCount: 0,
          memoryCount: 0,
          familyMembersCount: 0,
          legacyScore: 0,
        }),
      ),
    ).toBe(false);
    expect(
      isAchievementMet(
        { category: "photos", key: "photos.1", threshold: 1 },
        countersFromProgress({
          photoCount: 3,
          memoryCount: 0,
          familyMembersCount: 0,
          legacyScore: 0,
        }),
      ),
    ).toBe(true);
    expect(
      isAchievementMet(
        { category: "photos", key: "photos.10", threshold: 10 },
        counters,
      ),
    ).toBe(true);
    expect(
      isAchievementMet(
        { category: "photos", key: "photos.25", threshold: 25 },
        counters,
      ),
    ).toBe(false);
    expect(
      isAchievementMet(
        { category: "memories", key: "memories.1", threshold: 1 },
        counters,
      ),
    ).toBe(true);
    expect(
      isAchievementMet(
        { category: "family", key: "family.5", threshold: 5 },
        counters,
      ),
    ).toBe(false);
    expect(
      isAchievementMet(
        { category: "family", key: "family.3", threshold: 3 },
        counters,
      ),
    ).toBe(true);
    expect(
      isAchievementMet(
        { category: "family", key: "family.invite.sent", threshold: 1 },
        counters,
      ),
    ).toBe(true);
    expect(
      isAchievementMet(
        { category: "family", key: "family.builder.3", threshold: 3 },
        counters,
      ),
    ).toBe(true);
    expect(
      isAchievementMet(
        { category: "family", key: "family.builder.5", threshold: 5 },
        counters,
      ),
    ).toBe(false);
    expect(
      isAchievementMet(
        {
          category: "legacy",
          key: "legacy.category.banking",
          threshold: 1,
        },
        counters,
      ),
    ).toBe(true);
    expect(
      isAchievementMet(
        { category: "legacy", key: "legacy.50", threshold: 50 },
        counters,
      ),
    ).toBe(true);
    expect(
      isAchievementMet(
        { category: "legacy", key: "legacy.75", threshold: 75 },
        counters,
      ),
    ).toBe(false);
  });
});

describe("legacy journey board", () => {
  function track(
    partial: Partial<JourneyTrack> & Pick<JourneyTrack, "category">,
  ): JourneyTrack {
    return {
      label: partial.category,
      current: 0,
      unit: partial.category === "legacy" ? "percent" : "count",
      nextMilestone: null,
      unlocked: [],
      remaining: [],
      ...partial,
    };
  }

  it("recommends the closest unfinished milestone", () => {
    const action = recommendNextAction([
      track({
        category: "photos",
        current: 2,
        nextMilestone: {
          id: "p5",
          key: "photos.5",
          title: "Bronze Keepsake Badge",
          description: "",
          threshold: 5,
          lpReward: 25,
          badgeImage: null,
          unlockFeature: null,
        },
      }),
      track({
        category: "memories",
        current: 0,
        nextMilestone: {
          id: "m1",
          key: "memories.1",
          title: "First Story Badge",
          description: "",
          threshold: 1,
          lpReward: 15,
          badgeImage: null,
          unlockFeature: null,
        },
      }),
    ]);
    expect(action).toMatchObject({
      category: "photos",
      remaining: 3,
      kind: "photos",
      badgeTitle: "Bronze Keepsake Badge",
    });
  });
});

describe("memories journey snapshot", () => {
  it("maps the memories track next badge", () => {
    const journey: UserJourney = {
      userId: "u1",
      progress: null,
      familyProgress: null,
      totalLp: 15,
      level: 1,
      streakDays: 1,
      tracks: [
        {
          category: "memories",
          label: "Memories",
          current: 5,
          unit: "count",
          nextMilestone: {
            id: "ach_memories_10",
            key: "memories.10",
            title: "Copper Memory Badge",
            description: "",
            threshold: 10,
            lpReward: 60,
            badgeImage: null,
            unlockFeature: null,
          },
          unlocked: [],
          remaining: [],
        },
      ],
    };
    expect(memoriesSnapshotFromJourney(journey)).toMatchObject({
      category: "memories",
      current: 5,
      nextThreshold: 10,
      nextName: "Copper Memory Badge",
      nextLp: 60,
      complete: false,
    });
  });
});
