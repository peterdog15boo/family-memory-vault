/**
 * Memory journey hook: increment memoryCount, award LP, optional celebration.
 * Album/story: after createMemory. Film / holiday compilation: after movie ready.
 */

import { getUserFamilies } from "@/lib/families";
import {
  celebrationFromAward,
  mergeCelebrations,
} from "@/lib/gamification/celebration";
import { afterFamilyMemberFirstContribution } from "@/lib/gamification/family-invite";
import { hookMemoryCreated } from "@/lib/gamification/hooks";
import type {
  JourneyCelebrationPayload,
  MemoryKind,
} from "@/lib/gamification/types";

export async function awardMemoryCreatedCelebration(input: {
  userId: string;
  familyId?: string | null;
  memoryId?: string;
  movieId?: string;
  memoryKind: MemoryKind;
}): Promise<JourneyCelebrationPayload | null> {
  try {
    const familyId =
      input.familyId !== undefined
        ? input.familyId
        : ((await getUserFamilies(input.userId))[0]?.id ?? null);
    const result = await hookMemoryCreated({
      userId: input.userId,
      familyId,
      memoryId: input.memoryId,
      movieId: input.movieId,
      memoryKind: input.memoryKind,
    });
    const memoryCelebration = result
      ? await celebrationFromAward(result, "memories")
      : null;
    const familyCelebration = await afterFamilyMemberFirstContribution({
      userId: input.userId,
      familyId,
    });
    const celebration = mergeCelebrations(memoryCelebration, familyCelebration);
    if (celebration?.achievements.length) {
      const { queueMajorMilestoneOutreach } = await import(
        "@/lib/celebrations/outreach"
      );
      queueMajorMilestoneOutreach({
        userId: input.userId,
        achievements: celebration.achievements,
        href: input.memoryId ? `/memories/${input.memoryId}` : "/memories",
      });
    }
    return celebration;
  } catch (error) {
    console.error("[gamification] awardMemoryCreatedCelebration failed", {
      userId: input.userId,
      memoryId: input.memoryId,
      movieId: input.movieId,
      memoryKind: input.memoryKind,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function afterMemoryCreated(input: {
  userId: string;
  memoryId: string;
  memoryKind: MemoryKind;
  title?: string | null;
}): Promise<void> {
  const celebration = await awardMemoryCreatedCelebration({
    userId: input.userId,
    memoryId: input.memoryId,
    memoryKind: input.memoryKind,
  });

  try {
    const { notifyMemoryCreated } = await import("@/lib/notifications");
    await notifyMemoryCreated(input.userId, {
      memoryId: input.memoryId,
      memoryKind: input.memoryKind,
      title: input.title ?? undefined,
      link: `/memories/${input.memoryId}`,
      ...(celebration ? { celebration } : {}),
    });
  } catch (error) {
    console.error("[gamification] memory created notification failed", {
      userId: input.userId,
      memoryId: input.memoryId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
