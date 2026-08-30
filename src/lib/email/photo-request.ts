/**
 * Photo-request mail helper (additive to the in-app bell).
 *
 * Send function: `sendPhotoRequestEmail` → `sendEmail` (same Resend client
 * and FROM as family invites).
 *
 * Env vars expected (names only — never log values):
 *   RESEND_API_KEY  — required to deliver; missing used to return
 *     `{ ok: true, logged: true }`, which this helper treated as sent
 *   EMAIL_FROM      — optional; default verified
 *     Family Memory Vault <support@mail.familymemoryvault.ai>
 *   EMAIL_REPLY_TO  — optional
 *
 * Skip that explained “bell works, inbox empty”:
 *   In-app notify uses `target.userId` and does not need an address.
 *   Email was skipped or silently “succeeded” when (a) RESEND_API_KEY was
 *   missing (`logged` counted as sent), (b) accepted members had no
 *   `users.email` so invitedEmail was ignored, or (c) a prior request row
 *   inside 24h set already_sent even when no mail had actually gone out.
 * Dev/beta (NODE_ENV=development, NEXT_PUBLIC_BETA_PLAN_SWITCH, or the
 * existing beta flags) still calls Resend when the key exists; cooldown is
 * 1 minute. POST `?betaEmailRetry=1` in that mode skips the cooldown once.
 */

import {
  getEmailFromAddress,
  isEmailConfigured,
  sendEmail,
  type SendEmailResult,
} from "@/lib/email";
import { photoRequestEmail } from "@/lib/email/templates";
import type { AppLocale } from "@/lib/i18n";

export const PHOTO_REQUEST_EMAIL_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const PHOTO_REQUEST_EMAIL_BETA_COOLDOWN_MS = 60 * 1000;

function envFlagOn(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function envFlagOff(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "0" || v === "false" || v === "no" || v === "off";
}

/**
 * Shorter email cooldown + retry query. Production with beta flags off
 * keeps 24h. Never no-ops Resend just because we are on localhost.
 */
export function isPhotoRequestEmailTestMode(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  if (envFlagOn("NEXT_PUBLIC_BETA_PLAN_SWITCH")) return true;
  const picker = process.env.NEXT_PUBLIC_BETA_PLAN_PICKER;
  if (picker != null && picker.trim() !== "") {
    if (envFlagOff("NEXT_PUBLIC_BETA_PLAN_PICKER")) return false;
    if (envFlagOn("NEXT_PUBLIC_BETA_PLAN_PICKER")) return true;
  }
  return envFlagOn("NEXT_PUBLIC_ENABLE_BETA_FEEDBACK");
}

export function photoRequestEmailCooldownMs(): number {
  return isPhotoRequestEmailTestMode()
    ? PHOTO_REQUEST_EMAIL_BETA_COOLDOWN_MS
    : PHOTO_REQUEST_EMAIL_COOLDOWN_MS;
}

export function firstNameFromDisplayName(
  displayName: string | null | undefined,
): string {
  const trimmed = displayName?.trim();
  if (!trimmed) return "Someone";
  return trimmed.split(/\s+/)[0] ?? "Someone";
}

export function redactEmailAddress(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const first = local[0] ?? "*";
  return `${first}***@${domain}`;
}

function sanitizeEmailError(error: string | undefined): string | undefined {
  if (!error) return undefined;
  return error.replace(/re_[A-Za-z0-9]+/g, "[redacted]").slice(0, 180);
}

export function isFromAddressRejected(error: string | undefined): boolean {
  if (!error) return false;
  const msg = error.toLowerCase();
  return (
    msg.includes("from address") ||
    msg.includes("from.address") ||
    (msg.includes("domain") && msg.includes("not verified")) ||
    (msg.includes("from") && msg.includes("not verified")) ||
    (msg.includes("from") && msg.includes("rejected"))
  );
}

/**
 * Prefer the account email; fall back to the invite address so we still
 * call Resend when the users row has no email.
 */
export function recipientEmailForPhotoRequest(input: {
  hasAccount: boolean;
  accountEmail?: string | null;
  invitedEmail?: string | null;
}): string | null {
  const account = input.accountEmail?.trim() || null;
  const invited = input.invitedEmail?.trim() || null;
  if (input.hasAccount) {
    return account || invited;
  }
  return invited || account;
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
  | "missing_key"
  | "no_email"
  | "already_sent"
  | "send_failed"
  | "from_rejected";

export type PhotoRequestEmailDelivery = {
  sent: boolean;
  skipped: PhotoRequestEmailSkip | null;
  toRedacted: string | null;
};

type PhotoRequestEmailDeps = {
  lookupAccountEmail?: (userId: string | null) => Promise<string | null>;
  send?: typeof sendPhotoRequestEmail;
};

function logPhotoRequestEmail(payload: {
  outcome: "sent" | "skipped" | "threw";
  skip?: PhotoRequestEmailSkip | null;
  error?: string;
  toRedacted?: string | null;
  resendId?: string;
}): void {
  console.info("[photo-requests] email", {
    outcome: payload.outcome,
    skip: payload.skip ?? null,
    resend:
      payload.outcome === "sent"
        ? "ran"
        : payload.outcome === "threw"
          ? "threw"
          : "skipped",
    configured: isEmailConfigured(),
    from: getEmailFromAddress(),
    to: payload.toRedacted ?? null,
    resendId: payload.resendId,
    error: sanitizeEmailError(payload.error),
    testMode: isPhotoRequestEmailTestMode(),
    cooldownMs: photoRequestEmailCooldownMs(),
  });
}

/**
 * Send at most one photo-request email per requester → recipient per family
 * per cooldown window. Never throws — caller keeps the in-app notification.
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
): Promise<PhotoRequestEmailDelivery> {
  if (input.alreadySent) {
    logPhotoRequestEmail({ outcome: "skipped", skip: "already_sent" });
    return { sent: false, skipped: "already_sent", toRedacted: null };
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
    logPhotoRequestEmail({ outcome: "skipped", skip: "no_email" });
    return { sent: false, skipped: "no_email", toRedacted: null };
  }

  const toRedacted = redactEmailAddress(to);
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
    if (result.logged) {
      logPhotoRequestEmail({
        outcome: "skipped",
        skip: "missing_key",
        toRedacted,
      });
      return { sent: false, skipped: "missing_key", toRedacted };
    }
    if (!result.ok) {
      const skip: PhotoRequestEmailSkip = isFromAddressRejected(result.error)
        ? "from_rejected"
        : "send_failed";
      logPhotoRequestEmail({
        outcome: "skipped",
        skip,
        error: result.error,
        toRedacted,
      });
      return { sent: false, skipped: skip, toRedacted };
    }
    logPhotoRequestEmail({
      outcome: "sent",
      toRedacted,
      resendId: result.id,
    });
    return { sent: true, skipped: null, toRedacted };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email send failed";
    logPhotoRequestEmail({
      outcome: "threw",
      skip: "send_failed",
      error: message,
      toRedacted,
    });
    return { sent: false, skipped: "send_failed", toRedacted };
  }
}

/** In-app first, then email. Email failure does not undo a successful notify. */
export async function notifyThenEmailPhotoRequest(input: {
  targetUserId: string | null;
  notify: () => Promise<unknown>;
  email: () => Promise<PhotoRequestEmailDelivery>;
}): Promise<{
  notified: boolean;
  emailSent: boolean;
  skipped: PhotoRequestEmailSkip | null;
  toRedacted: string | null;
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
    toRedacted: emailResult.toRedacted,
  };
}
