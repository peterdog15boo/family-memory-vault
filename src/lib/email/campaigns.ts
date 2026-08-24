/**
 * Automated feature-discovery emails — eligibility, cadence, and drain.
 *
 * Rules:
 * - At most one tip email per user per 7 days
 * - Each campaign key is sent at most once
 * - Feature use suppresses that campaign
 * - Respects emailFeatureTips preference
 */

import { and, count, desc, eq, isNull, ne, sql } from "drizzle-orm";
import {
  getAccountPreferences,
  resolveAccountPreferences,
  updateAccountPreferences,
  userAllowsEmail,
} from "@/lib/account-preferences";
import { getDb } from "@/lib/db";
import {
  assistantConversations,
  assistantMessages,
  familyChatMessages,
  familyMembers,
  media,
  movies,
  people,
  users,
} from "@/lib/db/schema";
import {
  sendInviteFamilyTipEmail,
  sendMakeFirstMovieTipEmail,
  sendNamePeopleTipEmail,
  sendTryAskAiTipEmail,
  sendTryFamilyChatTipEmail,
} from "@/lib/email";
import { emailAppUrl } from "@/lib/email/templates";
import { getUserContact } from "@/lib/email/lifecycle";

export const LIFECYCLE_CAMPAIGN_KEYS = [
  "invite_family",
  "make_first_movie",
  "name_people",
  "try_family_chat",
  "try_ask_ai",
] as const;

export type LifecycleCampaignKey = (typeof LIFECYCLE_CAMPAIGN_KEYS)[number];

/** Enough clean/ready media to suggest Simple Mode movie. */
export const MOVIE_TIP_MIN_MEDIA = 5;
/** Enough media to suggest Ask AI. */
export const ASK_AI_TIP_MIN_MEDIA = 3;

export const LIFECYCLE_EMAIL_COOLDOWN_DAYS = 7;

export type UserFeatureSnapshot = {
  mediaCount: number;
  movieCount: number;
  peopleCount: number;
  hasInvitedFamily: boolean;
  hasFamilyWithOthers: boolean;
  hasUsedFamilyChat: boolean;
  hasUsedAskAi: boolean;
};

export function hasLifecycleCooldownElapsed(input: {
  lastLifecycleEmailAt: string | null | undefined;
  now?: Date;
  cooldownDays?: number;
}): boolean {
  if (!input.lastLifecycleEmailAt) return true;
  const last = new Date(input.lastLifecycleEmailAt).getTime();
  if (!Number.isFinite(last)) return true;
  const days = input.cooldownDays ?? LIFECYCLE_EMAIL_COOLDOWN_DAYS;
  const elapsedDays =
    ((input.now ?? new Date()).getTime() - last) / (24 * 60 * 60 * 1000);
  return elapsedDays >= days;
}

export function alreadySentCampaign(
  sent: readonly string[] | null | undefined,
  key: LifecycleCampaignKey,
): boolean {
  return (sent ?? []).includes(key);
}

/**
 * Pick the highest-priority tip the user is eligible for.
 * Order matches product funnel: invite → movie → people → chat → Ask AI.
 */
export function pickEligibleCampaign(
  snapshot: UserFeatureSnapshot,
  sent: readonly string[] | null | undefined,
): LifecycleCampaignKey | null {
  const checks: Array<{
    key: LifecycleCampaignKey;
    eligible: boolean;
  }> = [
    {
      key: "invite_family",
      eligible:
        (snapshot.mediaCount > 0 || snapshot.movieCount > 0) &&
        !snapshot.hasInvitedFamily,
    },
    {
      key: "make_first_movie",
      eligible:
        snapshot.mediaCount >= MOVIE_TIP_MIN_MEDIA && snapshot.movieCount === 0,
    },
    {
      key: "name_people",
      eligible: snapshot.mediaCount > 0 && snapshot.peopleCount === 0,
    },
    {
      key: "try_family_chat",
      eligible: snapshot.hasFamilyWithOthers && !snapshot.hasUsedFamilyChat,
    },
    {
      key: "try_ask_ai",
      eligible:
        snapshot.mediaCount >= ASK_AI_TIP_MIN_MEDIA && !snapshot.hasUsedAskAi,
    },
  ];

  for (const row of checks) {
    if (alreadySentCampaign(sent, row.key)) continue;
    if (row.eligible) return row.key;
  }
  return null;
}

export async function loadUserFeatureSnapshot(
  userId: string,
): Promise<UserFeatureSnapshot> {
  const db = getDb();

  const [
    [mediaRow],
    [movieRow],
    [peopleRow],
    [inviteRow],
    [familyOthersRow],
    [chatRow],
    [askAiRow],
  ] = await Promise.all([
    db
      .select({ value: count() })
      .from(media)
      .where(
        and(
          eq(media.userId, userId),
          eq(media.status, "ready"),
          eq(media.moderationStatus, "clean"),
        ),
      ),
    db
      .select({ value: count() })
      .from(movies)
      .where(eq(movies.userId, userId)),
    db
      .select({ value: count() })
      .from(people)
      .where(eq(people.userId, userId)),
    db
      .select({ value: count() })
      .from(familyMembers)
      .where(eq(familyMembers.invitedByUserId, userId)),
    db
      .select({ value: sql<number>`1` })
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.userId, userId),
          eq(familyMembers.status, "active"),
          sql`exists (
            select 1 from family_members o
            where o.family_id = ${familyMembers.familyId}
              and o.id <> ${familyMembers.id}
              and o.status in ('active', 'pending')
          )`,
        ),
      )
      .limit(1),
    db
      .select({ value: count() })
      .from(familyChatMessages)
      .where(eq(familyChatMessages.senderUserId, userId)),
    db
      .select({ value: count() })
      .from(assistantMessages)
      .innerJoin(
        assistantConversations,
        eq(assistantMessages.conversationId, assistantConversations.id),
      )
      .where(
        and(
          eq(assistantConversations.userId, userId),
          eq(assistantMessages.role, "user"),
        ),
      ),
  ]);

  return {
    mediaCount: Number(mediaRow?.value ?? 0),
    movieCount: Number(movieRow?.value ?? 0),
    peopleCount: Number(peopleRow?.value ?? 0),
    hasInvitedFamily: Number(inviteRow?.value ?? 0) > 0,
    hasFamilyWithOthers: Boolean(familyOthersRow),
    hasUsedFamilyChat: Number(chatRow?.value ?? 0) > 0,
    hasUsedAskAi: Number(askAiRow?.value ?? 0) > 0,
  };
}

async function deliverCampaign(
  key: LifecycleCampaignKey,
  contact: { email: string; firstName: string | null },
): Promise<boolean> {
  switch (key) {
    case "invite_family": {
      const result = await sendInviteFamilyTipEmail({
        to: contact.email,
        firstName: contact.firstName,
        inviteCtaUrl: emailAppUrl("/family"),
      });
      return result.ok;
    }
    case "make_first_movie": {
      const result = await sendMakeFirstMovieTipEmail({
        to: contact.email,
        firstName: contact.firstName,
        movieCtaUrl: emailAppUrl("/movies"),
      });
      return result.ok;
    }
    case "name_people": {
      const result = await sendNamePeopleTipEmail({
        to: contact.email,
        firstName: contact.firstName,
        peopleCtaUrl: emailAppUrl("/people"),
      });
      return result.ok;
    }
    case "try_family_chat": {
      const result = await sendTryFamilyChatTipEmail({
        to: contact.email,
        firstName: contact.firstName,
        chatCtaUrl: emailAppUrl("/dashboard#family-chat"),
      });
      return result.ok;
    }
    case "try_ask_ai": {
      const result = await sendTryAskAiTipEmail({
        to: contact.email,
        firstName: contact.firstName,
        askAiCtaUrl: emailAppUrl("/assistant"),
      });
      return result.ok;
    }
    default:
      return false;
  }
}

export async function stampLifecycleEmailSent(
  userId: string,
  campaignKey: LifecycleCampaignKey,
  at = new Date(),
): Promise<void> {
  const prefs = await getAccountPreferences(userId);
  const sent = new Set(prefs.lifecycleEmailsSent ?? []);
  sent.add(campaignKey);
  await updateAccountPreferences(userId, {
    lastLifecycleEmailAt: at.toISOString(),
    lifecycleEmailsSent: [...sent],
  });
}

/**
 * Evaluate + send at most one tip for a user.
 */
export async function deliverLifecycleTipForUser(
  userId: string,
  options?: { force?: boolean; now?: Date },
): Promise<{
  sent: boolean;
  skipped?: string;
  campaign?: LifecycleCampaignKey;
}> {
  if (!(await userAllowsEmail(userId, "feature_tips"))) {
    return { sent: false, skipped: "prefs_off" };
  }

  const prefs = await getAccountPreferences(userId);
  if (
    !options?.force &&
    !hasLifecycleCooldownElapsed({
      lastLifecycleEmailAt: prefs.lastLifecycleEmailAt,
      now: options?.now,
    })
  ) {
    return { sent: false, skipped: "cadence" };
  }

  const snapshot = await loadUserFeatureSnapshot(userId);
  const campaign = pickEligibleCampaign(snapshot, prefs.lifecycleEmailsSent);
  if (!campaign) {
    return { sent: false, skipped: "not_eligible" };
  }

  const contact = await getUserContact(userId);
  if (!contact?.email) {
    return { sent: false, skipped: "no_email" };
  }

  const ok = await deliverCampaign(campaign, contact);
  if (!ok) {
    return { sent: false, skipped: "delivery_failed", campaign };
  }

  await stampLifecycleEmailSent(userId, campaign, options?.now ?? new Date());
  return { sent: true, campaign };
}

/**
 * Batch tip drain for cron / worker.
 */
export async function drainLifecycleTipEmails(input?: {
  limit?: number;
  force?: boolean;
  now?: Date;
}): Promise<{
  processed: Array<{
    userId: string;
    sent: boolean;
    skipped?: string;
    campaign?: LifecycleCampaignKey;
  }>;
}> {
  const limit = Math.min(Math.max(input?.limit ?? 40, 1), 100);
  const now = input?.now ?? new Date();
  const db = getDb();

  const candidates = await db
    .select({
      id: users.id,
      accountPreferences: users.accountPreferences,
    })
    .from(users)
    .where(
      and(
        isNull(users.suspendedAt),
        ne(users.email, ""),
        sql`exists (
          select 1 from media m
          where m.user_id = ${users.id}
            and m.moderation_status = 'clean'
            and m.status = 'ready'
        )`,
      ),
    )
    .orderBy(desc(users.updatedAt))
    .limit(limit * 4);

  const processed: Array<{
    userId: string;
    sent: boolean;
    skipped?: string;
    campaign?: LifecycleCampaignKey;
  }> = [];

  for (const user of candidates) {
    if (processed.length >= limit) break;
    const prefs = resolveAccountPreferences(user.accountPreferences);
    if (!prefs.emailFeatureTips) continue;
    if (
      !input?.force &&
      !hasLifecycleCooldownElapsed({
        lastLifecycleEmailAt: prefs.lastLifecycleEmailAt,
        now,
      })
    ) {
      continue;
    }

    const result = await deliverLifecycleTipForUser(user.id, {
      force: input?.force,
      now,
    });
    processed.push({
      userId: user.id,
      sent: result.sent,
      skipped: result.skipped,
      campaign: result.campaign,
    });
  }

  return { processed };
}
