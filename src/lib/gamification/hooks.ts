/**
 * Domain wrappers around awardProgress.
 *
 * Photos: `afterPhotoBecameLibraryReady` (moderation clean).
 * Memories: `afterMemoryCreated` (album/story create + movie ready).
 * Family: invite sent / accepted / first contribution.
 * Legacy: not wired yet.
 */

import { tryAwardProgress } from "@/lib/gamification/award";
import type {
  AwardProgressEvent,
  AwardProgressResult,
  MemoryKind,
} from "@/lib/gamification/types";

export async function hookPhotoReady(input: {
  userId: string;
  familyId?: string | null;
  mediaId?: string;
}): Promise<AwardProgressResult | null> {
  return tryAwardProgress({
    type: "photo_upload",
    userId: input.userId,
    familyId: input.familyId,
    metadata: { mediaId: input.mediaId },
  });
}

export async function hookMemoryCreated(input: {
  userId: string;
  familyId?: string | null;
  memoryId?: string;
  movieId?: string;
  memoryKind?: MemoryKind;
}): Promise<AwardProgressResult | null> {
  return tryAwardProgress({
    type: "memory_create",
    userId: input.userId,
    familyId: input.familyId,
    metadata: {
      memoryId: input.memoryId,
      movieId: input.movieId,
      memoryKind: input.memoryKind,
    },
  });
}

export async function hookInviteSent(input: {
  userId: string;
  familyId: string;
  memberId?: string;
}): Promise<AwardProgressResult | null> {
  return tryAwardProgress({
    type: "invite_sent",
    userId: input.userId,
    familyId: input.familyId,
    metadata: { memberId: input.memberId },
  });
}

export async function hookInviteAccepted(input: {
  userId: string;
  familyId: string;
  memberId?: string;
  activeMembers?: number;
}): Promise<AwardProgressResult | null> {
  return tryAwardProgress({
    type: "invite_accepted",
    userId: input.userId,
    familyId: input.familyId,
    metadata: {
      memberId: input.memberId,
      activeMembers: input.activeMembers,
    },
  });
}

export async function hookMemberFirstContribution(input: {
  userId: string;
  familyId: string;
  memberId?: string;
  contributingMembers: number;
}): Promise<AwardProgressResult | null> {
  return tryAwardProgress({
    type: "member_first_contribution",
    userId: input.userId,
    familyId: input.familyId,
    metadata: {
      memberId: input.memberId,
      contributingMembers: input.contributingMembers,
    },
  });
}

export async function hookLegacyItemAdded(input: {
  userId: string;
  familyId?: string | null;
  categoryId?: string;
  legacyScore?: number;
  completedCategories?: string[];
}): Promise<AwardProgressResult | null> {
  return tryAwardProgress({
    type: "legacy_item_added",
    userId: input.userId,
    familyId: input.familyId,
    metadata: {
      categoryId: input.categoryId,
      legacyScore: input.legacyScore,
      completedCategories: input.completedCategories,
    },
  });
}

export type { AwardProgressEvent, AwardProgressResult };
