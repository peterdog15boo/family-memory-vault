/**
 * Notify the team when a new FeedbackSubmission arrives.
 * Email (Resend) and/or Slack/Discord-compatible webhook.
 */

import { getEnvAdminUserIds } from "@/lib/auth/admin";
import { getDb } from "@/lib/db";
import { users, type FeedbackSubmission } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { feedbackSubmissionAdminEmail } from "@/lib/email/templates";
import { getAppUrl } from "@/lib/env";
import { eq, inArray, or } from "drizzle-orm";

export type FeedbackNotifyResult = {
  emailed: boolean;
  webhook: boolean;
  errors: string[];
};

function parseEmailList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

/**
 * FEEDBACK_NOTIFY_EMAIL → ADMIN_NOTIFY_EMAIL → DB / env admins.
 */
export async function getFeedbackNotifyEmails(): Promise<string[]> {
  const configured =
    process.env.FEEDBACK_NOTIFY_EMAIL?.trim() ||
    process.env.ADMIN_NOTIFY_EMAIL?.trim();
  const fromEnv = parseEmailList(configured);
  if (fromEnv.length > 0) return fromEnv;

  const db = getDb();
  const envIds = getEnvAdminUserIds();
  const conditions =
    envIds.length > 0
      ? or(eq(users.isAdmin, true), inArray(users.id, envIds))
      : eq(users.isAdmin, true);

  const adminRows = await db
    .select({ email: users.email })
    .from(users)
    .where(conditions);

  return [
    ...new Set(
      adminRows
        .map((r) => r.email?.trim().toLowerCase())
        .filter((e): e is string => Boolean(e)),
    ),
  ];
}

function getFeedbackWebhookUrl(): string | null {
  const url =
    process.env.FEEDBACK_WEBHOOK_URL?.trim() ||
    process.env.SLACK_WEBHOOK_URL?.trim() ||
    process.env.DISCORD_WEBHOOK_URL?.trim();
  return url || null;
}

function viewportLabel(row: FeedbackSubmission): string | null {
  if (row.viewportWidth == null || row.viewportHeight == null) return null;
  const dpr = row.devicePixelRatio ?? 1;
  return `${row.viewportWidth}×${row.viewportHeight} @${dpr}x`;
}

function buildWebhookPayload(row: FeedbackSubmission) {
  const kind = row.mode === "bug" ? "Bug report" : "Feature request";
  const lines = [
    `*${row.ticketId}* — ${kind}`,
    `*${row.title}*`,
    `Category: ${row.category} · Status: ${row.status}`,
    row.severity ? `Severity: ${row.severity}` : null,
    `Reporter: ${row.email ?? "(none)"} (${row.userId ?? "unknown"})`,
    `Page: ${row.pageUrl}`,
    `Browser: ${row.browser ?? "?"} · ${row.os ?? "?"}`,
    row.screenshotKey ? `Screenshot: \`${row.screenshotKey}\`` : "Screenshot: none",
    "",
    row.description.slice(0, 500),
  ].filter((line): line is string => line !== null);

  const text = lines.join("\n");

  return {
    // Slack incoming webhooks
    text,
    // Discord incoming webhooks
    content: text.slice(0, 1900),
    // Structured payload for custom receivers
    feedback: {
      id: row.id,
      ticketId: row.ticketId,
      status: row.status,
      mode: row.mode,
      title: row.title,
      description: row.description,
      category: row.category,
      severity: row.severity,
      expectedBehavior: row.expectedBehavior,
      problemStatement: row.problemStatement,
      suggestedSolution: row.suggestedSolution,
      email: row.email,
      userId: row.userId,
      pathname: row.pathname,
      pageUrl: row.pageUrl,
      browser: row.browser,
      os: row.os,
      viewport: viewportLabel(row),
      screenshotKey: row.screenshotKey,
      screenshotContentType: row.screenshotContentType,
      consoleErrors: row.consoleErrors,
      context: row.context,
      createdAt: row.createdAt.toISOString(),
    },
  };
}

async function sendFeedbackWebhook(
  row: FeedbackSubmission,
): Promise<{ ok: boolean; error?: string }> {
  const url = getFeedbackWebhookUrl();
  if (!url) return { ok: false, error: "No webhook configured" };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildWebhookPayload(row)),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Webhook HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Webhook failed",
    };
  }
}

/**
 * Fire-and-forget friendly: never throws. Logs failures.
 */
export async function notifyFeedbackSubmission(
  row: FeedbackSubmission,
): Promise<FeedbackNotifyResult> {
  const errors: string[] = [];
  let emailed = false;
  let webhook = false;

  try {
    const recipients = await getFeedbackNotifyEmails();
    if (recipients.length === 0) {
      console.warn(
        "[feedback] No notify emails configured; submission saved without email",
        { ticketId: row.ticketId },
      );
    } else {
      const content = feedbackSubmissionAdminEmail({
        ticketId: row.ticketId,
        mode: row.mode === "feature" ? "feature" : "bug",
        title: row.title,
        description: row.description,
        category: row.category,
        status: row.status,
        severity: row.severity,
        expectedBehavior: row.expectedBehavior,
        problemStatement: row.problemStatement,
        suggestedSolution: row.suggestedSolution,
        email: row.email,
        userId: row.userId,
        pageUrl: row.pageUrl,
        pathname: row.pathname,
        browser: row.browser,
        os: row.os,
        viewport: viewportLabel(row),
        screenshotKey: row.screenshotKey,
        consoleErrors: row.consoleErrors,
        clientTimestamp: row.clientTimestamp?.toISOString() ?? null,
        adminUrl: `${getAppUrl()}/admin`,
      });

      const result = await sendEmail({
        to: recipients,
        subject: content.subject,
        html: content.html,
        text: content.text,
        replyTo: row.email ?? undefined,
        tags: [{ name: "template", value: "feedback_submission_admin" }],
      });

      if (result.ok) {
        emailed = true;
      } else {
        errors.push(result.error ?? "Email failed");
        console.error("[feedback] admin notify email failed", {
          ticketId: row.ticketId,
          error: result.error,
        });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    console.error("[feedback] admin notify email threw", {
      ticketId: row.ticketId,
      error: message,
    });
  }

  if (getFeedbackWebhookUrl()) {
    const result = await sendFeedbackWebhook(row);
    if (result.ok) {
      webhook = true;
    } else {
      errors.push(result.error ?? "Webhook failed");
      console.error("[feedback] webhook notify failed", {
        ticketId: row.ticketId,
        error: result.error,
      });
    }
  }

  return { emailed, webhook, errors };
}
