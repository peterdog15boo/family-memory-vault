/**
 * LP + level curves. Keep simple and monotonic so UI copy stays honest.
 *
 * Level 1 starts at 0 LP. Each 100 LP raises the personal level by 1.
 * Family vault level weights household activity.
 */

export const LP_PER_LEVEL = 100;

export const EVENT_LP: Record<
  | "photo_upload"
  | "memory_create"
  | "invite_sent"
  | "invite_accepted"
  | "member_first_contribution"
  | "legacy_item_added",
  number
> = {
  photo_upload: 2,
  memory_create: 8,
  invite_sent: 5,
  invite_accepted: 25,
  member_first_contribution: 15,
  legacy_item_added: 5,
};

export function levelFromLp(totalLp: number): number {
  const lp = Math.max(0, Math.floor(totalLp));
  return 1 + Math.floor(lp / LP_PER_LEVEL);
}

export function lpIntoCurrentLevel(totalLp: number): {
  level: number;
  lpInLevel: number;
  lpToNext: number;
} {
  const level = levelFromLp(totalLp);
  const floor = (level - 1) * LP_PER_LEVEL;
  const lpInLevel = Math.max(0, Math.floor(totalLp) - floor);
  return { level, lpInLevel, lpToNext: LP_PER_LEVEL - lpInLevel };
}

export function vaultLevelFromFamily(input: {
  totalPhotos: number;
  totalMemories: number;
  activeMembers: number;
  averageLegacyScore: number;
}): number {
  const score =
    Math.max(0, input.totalPhotos) +
    Math.max(0, input.totalMemories) * 5 +
    Math.max(0, input.activeMembers) * 20 +
    Math.max(0, input.averageLegacyScore);
  return 1 + Math.floor(score / 50);
}

/** UTC calendar day key YYYY-MM-DD. */
export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function computeStreakDays(input: {
  lastActiveAt: Date | null | undefined;
  previousStreak: number;
  now?: Date;
}): number {
  const now = input.now ?? new Date();
  const today = utcDayKey(now);
  if (!input.lastActiveAt) return 1;

  const lastDay = utcDayKey(input.lastActiveAt);
  if (lastDay === today) {
    return Math.max(1, input.previousStreak || 1);
  }

  const yesterday = utcDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  if (lastDay === yesterday) {
    return Math.max(1, input.previousStreak || 0) + 1;
  }

  return 1;
}
