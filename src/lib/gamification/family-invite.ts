/**
 * Family invite + Active Circle hooks.
 */

import { and, count, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { familyMembers } from "@/lib/db/schema";
import { celebrationFromAward } from "@/lib/gamification/celebration";
import {
  hookInviteAccepted,
  hookInviteSent,
  hookMemberFirstContribution,
} from "@/lib/gamification/hooks";
import type { JourneyCelebrationPayload } from "@/lib/gamification/types";

export async function afterInviteSent(input: {
  userId: string;
  familyId: string;
  memberId: string;
  isNewInvite: boolean;
}): Promise<JourneyCelebrationPayload | null> {
  if (!input.isNewInvite) return null;
  try {
    const result = await hookInviteSent({
      userId: input.userId,
      familyId: input.familyId,
      memberId: input.memberId,
    });
    if (!result) return null;
    const celebration = await celebrationFromAward(result, "family");
    if (!celebration) return null;
    return { ...celebration, presentation: "micro" };
  } catch (error) {
    console.error("[gamification] afterInviteSent failed", {
      userId: input.userId,
      familyId: input.familyId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function afterInviteAccepted(input: {
  familyId: string;
  memberId: string;
  inviterUserId: string | null;
}): Promise<void> {
  if (!input.inviterUserId) return;

  try {
    const db = getDb();
    const [row] = await db
      .select({ value: count() })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.familyId, input.familyId),
          eq(familyMembers.status, "active"),
        ),
      );
    const activeMembers = Number(row?.value ?? 0);

    const result = await hookInviteAccepted({
      userId: input.inviterUserId,
      familyId: input.familyId,
      memberId: input.memberId,
      activeMembers,
    });
    if (!result) return;

    const celebration = await celebrationFromAward(result, "family");
    if (celebration?.achievements.length) {
      const { queueMajorMilestoneOutreach } = await import(
        "@/lib/celebrations/outreach"
      );
      queueMajorMilestoneOutreach({
        userId: input.inviterUserId,
        achievements: celebration.achievements,
        href: "/family",
      });
    }
    const { notifyFamilyMilestone } = await import("@/lib/notifications");
    await notifyFamilyMilestone(input.inviterUserId, {
      familyId: input.familyId,
      memberId: input.memberId,
      kind: "invite_accepted",
      link: "/family",
      ...(celebration ? { celebration } : {}),
    });
  } catch (error) {
    console.error("[gamification] afterInviteAccepted failed", {
      familyId: input.familyId,
      inviterUserId: input.inviterUserId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function afterFamilyMemberFirstContribution(input: {
  userId: string;
  familyId?: string | null;
}): Promise<JourneyCelebrationPayload | null> {
  try {
    const familyId = input.familyId;
    if (!familyId) return null;

    const db = getDb();
    const [membership] = await db
      .select()
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.familyId, familyId),
          eq(familyMembers.userId, input.userId),
          eq(familyMembers.status, "active"),
        ),
      )
      .limit(1);
    if (!membership || membership.firstContributedAt) return null;

    const now = new Date();
    const claimed = await db
      .update(familyMembers)
      .set({ firstContributedAt: now, updatedAt: now })
      .where(
        and(
          eq(familyMembers.id, membership.id),
          sql`${familyMembers.firstContributedAt} is null`,
        ),
      )
      .returning({ id: familyMembers.id });
    if (claimed.length === 0) return null;

    const [countRow] = await db
      .select({ value: count() })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.familyId, familyId),
          eq(familyMembers.status, "active"),
          isNotNull(familyMembers.firstContributedAt),
        ),
      );
    const contributingMembers = Number(countRow?.value ?? 0);

    const contributorResult = await hookMemberFirstContribution({
      userId: input.userId,
      familyId,
      memberId: membership.id,
      contributingMembers,
    });

    const inviterId = membership.invitedByUserId;
    if (inviterId && inviterId !== input.userId) {
      const inviterResult = await hookMemberFirstContribution({
        userId: inviterId,
        familyId,
        memberId: membership.id,
        contributingMembers,
      });
      if (inviterResult) {
        const inviterCelebration = await celebrationFromAward(
          inviterResult,
          "family",
        );
        const { notifyFamilyMilestone } = await import("@/lib/notifications");
        await notifyFamilyMilestone(inviterId, {
          familyId,
          memberId: membership.id,
          kind: "first_contribution",
          link: "/family",
          ...(inviterCelebration ? { celebration: inviterCelebration } : {}),
        });
      }
    }

    if (!contributorResult) return null;
    return celebrationFromAward(contributorResult, "family");
  } catch (error) {
    console.error("[gamification] afterFamilyMemberFirstContribution failed", {
      userId: input.userId,
      familyId: input.familyId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
