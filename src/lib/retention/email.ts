/**
 * Weekly soft retention email — one focus per week, plan-aware wording.
 */

import { and, desc, isNull, lt, ne } from "drizzle-orm";
import {
  getAccountPreferences,
  updateAccountPreferences,
  userAllowsEmail,
} from "@/lib/account-preferences";
import { hasAcceptedBetaNda } from "@/lib/beta-nda";
import { isBetaNdaRequired } from "@/lib/beta-nda/constants";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { getUserContact } from "@/lib/email/lifecycle";
import { emailAppUrl } from "@/lib/email/templates";
import { isRetentionEmailEnabled } from "@/lib/retention/flags";
import { isUserDormant } from "@/lib/retention/dormancy";
import { loadRetentionVaultSnapshot } from "@/lib/retention/snapshot";
import {
  buildRetentionTipCard,
  pickRetentionTipId,
  retentionEmailSubject,
} from "@/lib/retention/tips";
import {
  RETENTION_EMAIL_COOLDOWN_DAYS,
  RETENTION_EMAIL_MIN_ACCOUNT_DAYS,
} from "@/lib/retention/types";
import { createRetentionUnsubscribeToken } from "@/lib/retention/unsubscribe";
import { hasAcceptedTerms } from "@/lib/terms";
import { isTermsRequired } from "@/lib/terms/constants";
import { retentionWeeklyEmail } from "@/lib/retention/email-template";

function hasRetentionCooldownElapsed(
  lastAt: string | null | undefined,
  now: Date,
): boolean {
  if (!lastAt) return true;
  const last = new Date(lastAt).getTime();
  if (!Number.isFinite(last)) return true;
  const days = (now.getTime() - last) / (24 * 60 * 60 * 1000);
  return days >= RETENTION_EMAIL_COOLDOWN_DAYS;
}

async function legalOk(userId: string): Promise<boolean> {
  if (isBetaNdaRequired() && !(await hasAcceptedBetaNda(userId))) {
    return false;
  }
  if (isTermsRequired() && !(await hasAcceptedTerms(userId))) {
    return false;
  }
  return true;
}

export async function deliverRetentionEmailForUser(
  userId: string,
  options?: { force?: boolean; now?: Date },
): Promise<{ sent: boolean; skipped?: string; tipId?: string }> {
  if (!isRetentionEmailEnabled()) {
    return { sent: false, skipped: "flag_off" };
  }
  if (!(await userAllowsEmail(userId, "weekly_ideas"))) {
    return { sent: false, skipped: "prefs_off" };
  }
  if (!(await legalOk(userId))) {
    return { sent: false, skipped: "legal" };
  }

  const prefs = await getAccountPreferences(userId);
  const now = options?.now ?? new Date();
  if (
    !options?.force &&
    !hasRetentionCooldownElapsed(prefs.lastRetentionEmailAt, now)
  ) {
    return { sent: false, skipped: "cadence" };
  }

  const snapshot = await loadRetentionVaultSnapshot(userId);
  if (snapshot.accountAgeDays < RETENTION_EMAIL_MIN_ACCOUNT_DAYS) {
    return { sent: false, skipped: "too_new" };
  }

  // Soft campaign: prefer dormant users; still allow a quiet weekly idea
  // for less-active vaults (no meaningful action in cooldown window).
  const dormant = isUserDormant(snapshot, now);
  if (!dormant && !options?.force) {
    return { sent: false, skipped: "not_dormant" };
  }

  const tipId = pickRetentionTipId(snapshot, {
    weekIndex: prefs.weeklyEmailWeekIndex ?? 0,
    completed: [],
    snoozes: [],
  });
  if (!tipId) {
    return { sent: false, skipped: "not_eligible" };
  }

  const contact = await getUserContact(userId);
  if (!contact?.email) {
    return { sent: false, skipped: "no_email" };
  }

  const tip = buildRetentionTipCard(tipId, snapshot);
  const unsubToken = createRetentionUnsubscribeToken(userId);
  const unsubscribeUrl = unsubToken
    ? emailAppUrl(`/api/email/unsubscribe?token=${encodeURIComponent(unsubToken)}`)
    : emailAppUrl("/settings");
  const manageUrl = emailAppUrl("/settings");
  const ctaUrl = emailAppUrl(tip.href);

  const content = retentionWeeklyEmail({
    firstName: contact.firstName,
    tip,
    subject: retentionEmailSubject(tipId),
    ctaUrl,
    manageUrl,
    unsubscribeUrl,
    mediaCount: snapshot.mediaCount,
    peopleCount: snapshot.namedPeopleCount,
    memoryCount: snapshot.memoryCount,
  });

  const result = await sendEmail({
    to: contact.email,
    subject: content.subject,
    html: content.html,
    text: content.text,
    tags: [{ name: "template", value: "retention_weekly" }],
  });
  if (!result.ok) {
    return { sent: false, skipped: "delivery_failed", tipId };
  }

  await updateAccountPreferences(userId, {
    lastRetentionEmailAt: now.toISOString(),
    weeklyEmailWeekIndex: (prefs.weeklyEmailWeekIndex ?? 0) + 1,
  });

  return { sent: true, tipId };
}

export async function drainRetentionEmails(input?: {
  limit?: number;
  force?: boolean;
  now?: Date;
}): Promise<{
  processed: Array<{
    userId: string;
    sent: boolean;
    skipped?: string;
    tipId?: string;
  }>;
}> {
  if (!isRetentionEmailEnabled()) {
    console.info("[retention.email] skipped — flag off or Resend missing");
    return { processed: [] };
  }

  const limit = Math.min(Math.max(input?.limit ?? 40, 1), 100);
  const now = input?.now ?? new Date();
  const minAge = new Date(
    now.getTime() - RETENTION_EMAIL_MIN_ACCOUNT_DAYS * 24 * 60 * 60 * 1000,
  );
  const db = getDb();

  const candidates = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        isNull(users.suspendedAt),
        ne(users.email, ""),
        lt(users.createdAt, minAge),
      ),
    )
    .orderBy(desc(users.lastActiveAt))
    .limit(limit * 5);

  const processed: Array<{
    userId: string;
    sent: boolean;
    skipped?: string;
    tipId?: string;
  }> = [];

  for (const user of candidates) {
    if (processed.length >= limit) break;
    const result = await deliverRetentionEmailForUser(user.id, {
      force: input?.force,
      now,
    });
    if (result.skipped === "cadence" || result.skipped === "prefs_off") {
      continue;
    }
    processed.push({
      userId: user.id,
      sent: result.sent,
      skipped: result.skipped,
      tipId: result.tipId,
    });
  }

  return { processed };
}

export async function unsubscribeRetentionEmail(
  userId: string,
): Promise<void> {
  await updateAccountPreferences(userId, {
    emailWeeklyIdeas: false,
    retentionEmailUnsubscribedAt: new Date().toISOString(),
  });
}
