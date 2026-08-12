/**
 * Transactional email service (Resend).
 *
 * Usage:
 *   import { sendWelcomeEmail, sendEmail } from "@/lib/email";
 *   await sendWelcomeEmail({ to: "you@example.com", firstName: "Alex" });
 *
 * Without RESEND_API_KEY, emails are logged to the console (dev-friendly)
 * and not sent. Set EMAIL_FROM to a verified Resend from-address in production.
 */

import { Resend } from "resend";
import {
  familyInviteEmail,
  milestoneEmail,
  movieReadyEmail,
  paymentFailedEmail,
  paymentSuccessEmail,
  storageWarningEmail,
  welcomeEmail,
  type EmailContent,
} from "@/lib/email/templates";

export type {
  EmailContent,
} from "@/lib/email/templates";

export {
  welcomeEmail,
  familyInviteEmail,
  movieReadyEmail,
  storageWarningEmail,
  paymentSuccessEmail,
  paymentFailedEmail,
  memoryBoxOrderAdminEmail,
  feedbackSubmissionAdminEmail,
  milestoneEmail,
  emailAppUrl,
} from "@/lib/email/templates";

export {
  queueWelcomeEmail,
  queueFamilyInviteLifecycle,
  queueMovieReadyLifecycle,
  queueStorageThresholdCheck,
  queueMediaReadyNotification,
  maybeNotifyStorageThreshold,
  getUserContact,
} from "@/lib/email/lifecycle";

/* -------------------------------------------------------------------------- */
/* Config                                                                      */
/* -------------------------------------------------------------------------- */

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function getEmailFromAddress(): string {
  return (
    process.env.EMAIL_FROM?.trim() ||
    "Family Memory Vault <onboarding@resend.dev>"
  );
}

function getResendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return new Resend(key);
}

/* -------------------------------------------------------------------------- */
/* Core send                                                                   */
/* -------------------------------------------------------------------------- */

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  /** Override default EMAIL_FROM */
  from?: string;
  replyTo?: string;
  /** Optional tags for Resend analytics */
  tags?: Array<{ name: string; value: string }>;
};

export type SendEmailResult = {
  ok: boolean;
  /** Resend message id when sent */
  id?: string;
  /** True when logged locally instead of sent */
  logged?: boolean;
  error?: string;
};

function normalizeRecipients(to: string | string[]): string[] {
  const list = (Array.isArray(to) ? to : [to])
    .map((addr) => addr.trim())
    .filter(Boolean);
  return list;
}

/**
 * Low-level send. Prefer the typed template helpers below.
 */
export async function sendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const recipients = normalizeRecipients(input.to);
  if (recipients.length === 0) {
    return { ok: false, error: "No recipients" };
  }

  const from = input.from?.trim() || getEmailFromAddress();
  const payload = {
    from,
    to: recipients,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo,
    tags: input.tags,
  };

  const client = getResendClient();
  if (!client) {
    console.info("[email] RESEND_API_KEY not set — logging email instead of sending", {
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text?.slice(0, 500),
    });
    return { ok: true, logged: true };
  }

  try {
    const { data, error } = await client.emails.send({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      replyTo: payload.replyTo,
      tags: payload.tags,
    });

    if (error) {
      console.error("[email] Resend error", error);
      return { ok: false, error: error.message };
    }

    return { ok: true, id: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Email send failed";
    console.error("[email] send failed", err);
    return { ok: false, error: message };
  }
}

async function sendTemplated(
  to: string | string[],
  content: EmailContent,
  tag: string,
): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: content.subject,
    html: content.html,
    text: content.text,
    tags: [{ name: "template", value: tag }],
  });
}

/* -------------------------------------------------------------------------- */
/* Typed helpers — easy to call from workers, APIs, and webhooks               */
/* -------------------------------------------------------------------------- */

export async function sendWelcomeEmail(input: {
  to: string;
  firstName?: string | null;
}): Promise<SendEmailResult> {
  return sendTemplated(
    input.to,
    welcomeEmail({ firstName: input.firstName }),
    "welcome",
  );
}

export async function sendFamilyInviteEmail(input: {
  to: string;
  inviteeName?: string | null;
  inviterName: string;
  familyName: string;
  role?: string | null;
  inviteUrl: string;
  locale?: import("@/lib/i18n").AppLocale;
}): Promise<SendEmailResult> {
  return sendTemplated(
    input.to,
    familyInviteEmail(input),
    "family_invite",
  );
}

export async function sendMovieReadyEmail(input: {
  to: string;
  firstName?: string | null;
  movieTitle: string;
  movieUrl?: string;
}): Promise<SendEmailResult> {
  return sendTemplated(
    input.to,
    movieReadyEmail(input),
    "movie_ready",
  );
}

export async function sendStorageWarningEmail(input: {
  to: string;
  firstName?: string | null;
  percentUsed: number;
  planName?: string;
  usedLabel?: string;
}): Promise<SendEmailResult> {
  return sendTemplated(
    input.to,
    storageWarningEmail(input),
    "storage_warning",
  );
}

/** Optional — wire from Stripe invoice.paid when ready. */
export async function sendPaymentSuccessEmail(input: {
  to: string;
  firstName?: string | null;
  planName: string;
  amountLabel?: string;
  billingUrl?: string;
}): Promise<SendEmailResult> {
  return sendTemplated(
    input.to,
    paymentSuccessEmail(input),
    "payment_success",
  );
}

/** Optional — wire from Stripe invoice.payment_failed when ready. */
export async function sendPaymentFailedEmail(input: {
  to: string;
  firstName?: string | null;
  planName?: string;
  billingUrl?: string;
}): Promise<SendEmailResult> {
  return sendTemplated(
    input.to,
    paymentFailedEmail(input),
    "payment_failed",
  );
}

export async function sendMilestoneEmail(input: {
  to: string;
  firstName?: string | null;
  badgeTitle: string;
  badgeBody?: string | null;
  href?: string;
}): Promise<SendEmailResult> {
  return sendTemplated(input.to, milestoneEmail(input), "milestone");
}
