/**
 * Fire-and-forget email + push for rare major milestones.
 */

import {
  hrefForOutreachKey,
  pickOutreachMilestone,
} from "@/lib/celebrations/milestones";
import { queueWebPushIfConfigured } from "@/lib/celebrations/push";
import { sendMilestoneEmail } from "@/lib/email";
import { getUserContact } from "@/lib/email/lifecycle";
import { userAllowsEmail } from "@/lib/account-preferences";

export type OutreachAchievement = {
  key: string;
  title: string;
  description?: string | null;
};

export async function sendMajorMilestoneOutreach(input: {
  userId: string;
  achievements: readonly OutreachAchievement[];
  href?: string;
}): Promise<void> {
  const milestone = pickOutreachMilestone(input.achievements);
  if (!milestone) return;

  const href = input.href ?? hrefForOutreachKey(milestone.key);
  const allowEmail = await userAllowsEmail(input.userId, "milestone");

  await queueWebPushIfConfigured({
    userId: input.userId,
    title: milestone.title,
    body: milestone.description?.trim() || milestone.title,
    href,
  });

  if (!allowEmail) return;

  const contact = await getUserContact(input.userId);
  if (!contact?.email) return;

  const result = await sendMilestoneEmail({
    to: contact.email,
    firstName: contact.firstName,
    badgeTitle: milestone.title,
    badgeBody: milestone.description,
    href,
  });
  if (!result.ok) {
    console.error("[celebrations.outreach] email failed", result.error);
  }
}

/** Schedule without blocking award / upload paths. */
export function queueMajorMilestoneOutreach(input: {
  userId: string;
  achievements: readonly OutreachAchievement[];
  href?: string;
}): void {
  void sendMajorMilestoneOutreach(input).catch((error) => {
    console.error("[celebrations.outreach] queue failed", {
      userId: input.userId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
