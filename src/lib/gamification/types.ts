/**
 * Gamification event + journey types (optimistic, type-safe).
 */

import type {
  AchievementCategory,
  AchievementDefinition,
  FamilyProgress,
  GamificationEventType,
  UserProgress,
} from "@/lib/db/schema";

export type AwardProgressEventType = GamificationEventType;

/** Product shapes that count as a Memory on the journey ladder. */
export type MemoryKind =
  | "story"
  | "album"
  | "film"
  | "voice_note"
  | "holiday_compilation";

export type JourneyTrackKind = "photos" | "memories" | "family" | "legacy";

export type AwardProgressMetadata = {
  mediaId?: string;
  memoryId?: string;
  movieId?: string;
  /** How this memory was created. */
  memoryKind?: MemoryKind;
  memberId?: string;
  /** Active household size after invite accept. */
  activeMembers?: number;
  /** Members who have contributed a photo or memory. */
  contributingMembers?: number;
  /** Invites this user has sent (after a successful send). */
  invitesSent?: number;
  /** Legacy checklist item id, e.g. `message`. */
  categoryId?: string;
  /** 0–100 Digital Legacy readiness. */
  legacyScore?: number;
  /** Checklist item ids currently done. */
  completedCategories?: string[];
};

export type AwardProgressEvent = {
  type: AwardProgressEventType;
  userId: string;
  familyId?: string | null;
  metadata?: AwardProgressMetadata;
};

export type UnlockedAchievement = {
  id: string;
  key: string;
  title: string;
  description: string;
  category: AchievementCategory;
  threshold: number;
  lpReward: number;
  badgeImage: string | null;
  unlockFeature: string | null;
  unlockedAt: string;
};

export type CelebrationPayload = {
  kind: "none" | "achievement" | "level_up" | "both";
  achievements: UnlockedAchievement[];
  previousLevel: number;
  newLevel: number;
  lpGained: number;
};

/** Stored on notification metadata for the client celebration. */
export type JourneyCelebrationPayload = CelebrationPayload & {
  track: JourneyTrackKind;
  current: number;
  presentation?: "full" | "micro";
  nextGoal: {
    title: string;
    threshold: number;
    lpReward: number;
  } | null;
};

/** @deprecated Use JourneyCelebrationPayload */
export type PhotoCelebrationPayload = JourneyCelebrationPayload & {
  photoCount?: number;
};

export type AwardProgressResult = {
  newAchievements: UnlockedAchievement[];
  lpGained: number;
  leveledUp: boolean;
  celebrationPayload: CelebrationPayload;
  progress: UserProgress;
  familyProgress: FamilyProgress | null;
};

export type JourneyMilestone = {
  id: string;
  key: string;
  title: string;
  description: string;
  threshold: number;
  lpReward: number;
  badgeImage: string | null;
  unlockFeature: string | null;
};

export type JourneyTrack = {
  category: AchievementCategory;
  label: string;
  /** Current counter or legacy percent (0–100). */
  current: number;
  unit: "count" | "percent";
  nextMilestone: JourneyMilestone | null;
  unlocked: UnlockedAchievement[];
  remaining: JourneyMilestone[];
};

export type UserJourney = {
  userId: string;
  progress: UserProgress | null;
  familyProgress: FamilyProgress | null;
  totalLp: number;
  level: number;
  streakDays: number;
  tracks: JourneyTrack[];
};

export type AchievementSeed = Omit<
  AchievementDefinition,
  "createdAt" | "updatedAt"
>;
