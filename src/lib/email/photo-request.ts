/**
 * Resend template: photo_request
 * Family “Request photo” email. In-app notification is created separately.
 */

import { sendEmail, type SendEmailResult } from "@/lib/email";
import { photoRequestEmail } from "@/lib/email/templates";
import type { AppLocale } from "@/lib/i18n";

export const PHOTO_REQUEST_EMAIL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function firstNameFromDisplayName(
  displayName: string | null | undefined,
): string {
  const trimmed = displayName?.trim();
  if (!trimmed) return "Someone";
  return trimmed.split(/\s+/)[0] ?? "Someone";
}

/**
 * Account email for accepted members; invite email only when they have no account yet.
 */
export function recipientEmailForPhotoRequest(input: {
  hasAccount: boolean;
  accountEmail?: string | null;
  invitedEmail?: string | null;
}): string | null {
  if (input.hasAccount) {
    const account = input.accountEmail?.trim();
    return account || null;
  }
  const invited = input.invitedEmail?.trim();
  return invited || null;
}

export function shouldSendPhotoRequestEmail(recentCount: number): boolean {
  return recentCount < 1;
}

export async function sendPhotoRequestEmail(input: {
  to: string;
  requesterName: string;
  requesterFirstName: string;
  familyName: string;
  note?: string | null;
  ctaUrl: string;
  locale?: AppLocale;
}): Promise<SendEmailResult> {
  const content = photoRequestEmail(input);
  return sendEmail({
    to: input.to,
    subject: content.subject,
    html: content.html,
    text: content.text,
    tags: [{ name: "template", value: "photo_request" }],
  });
}

async function lookupAccountEmail(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { getDb } = await import("@/lib/db");
  const { users } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const db = getDb();
  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.email?.trim() || null;
}

export type PhotoRequestEmailSkip =
  | "no_email"
  | "already_sent"
  | "send_failed";

type PhotoRequestEmailDeps = {
  lookupAccountEmail?: (userId: string | null) => Promise<string | null>;
  send?: typeof sendPhotoRequestEmail;
};

/**
 * Send at most one photo-request email per requester → recipient per family
 * per 24 hours. Never throws — caller keeps the in-app notification.
 */
export async function sendPhotoRequestFollowUpEmail(
  input: {
    targetUserId: string | null;
    invitedEmail: string | null;
    alreadySent: boolean;
    familyName: string;
    requesterName: string | null;
    message: string;
    ctaUrl: string;
  },
  deps: PhotoRequestEmailDeps = {},
): Promise<{ sent: boolean; skipped: PhotoRequestEmailSkip | null }> {
  if (input.alreadySent) {
    return { sent: false, skipped: "already_sent" };
  }

  const lookup = deps.lookupAccountEmail ?? lookupAccountEmail;
  const send = deps.send ?? sendPhotoRequestEmail;
  const accountEmail = await lookup(input.targetUserId);
  const to = recipientEmailForPhotoRequest({
    hasAccount: Boolean(input.targetUserId),
    accountEmail,
    invitedEmail: input.invitedEmail,
  });
  if (!to) {
    return { sent: false, skipped: "no_email" };
  }

  const requesterName = input.requesterName?.trim() || "Someone";
  try {
    const result = await send({
      to,
      requesterName,
      requesterFirstName: firstNameFromDisplayName(requesterName),
      familyName: input.familyName,
      note: input.message,
      ctaUrl: input.ctaUrl,
    });
    if (!result.ok) {
      console.error("[photo-requests] email failed", result.error);
      return { sent: false, skipped: "send_failed" };
    }
    return { sent: true, skipped: null };
  } catch (error) {
    console.error("[photo-requests] email failed", error);
    return { sent: false, skipped: "send_failed" };
  }
}

/** In-app first, then email. Email failure does not undo a successful notify. */
export async function notifyThenEmailPhotoRequest(input: {
  targetUserId: string | null;
  notify: () => Promise<unknown>;
  email: () => Promise<{ sent: boolean; skipped: PhotoRequestEmailSkip | null }>;
}): Promise<{
  notified: boolean;
  emailSent: boolean;
  skipped: PhotoRequestEmailSkip | null;
}> {
  let notified = false;
  if (input.targetUserId) {
    try {
      await input.notify();
      notified = true;
    } catch (error) {
      console.error("[photo-requests] notify failed", error);
    }
  }
  const emailResult = await input.email();
  return {
    notified,
    emailSent: emailResult.sent,
    skipped: emailResult.skipped,
  };
}
