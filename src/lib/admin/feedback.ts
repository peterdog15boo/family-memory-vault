/**
 * Admin helpers for beta FeedbackSubmission triage.
 */

import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  FEEDBACK_EMAIL_ACK_ACTION,
  FEEDBACK_EMAIL_REPLY_ACTION,
  feedbackEmailActionToKind,
  formatFeedbackEmailHistoryLine,
  type FeedbackEmailSendEvent,
} from "@/lib/admin/feedback-email-history";
import { getDb } from "@/lib/db";
import {
  FEEDBACK_SUBMISSION_STATUSES,
  adminAuditLogs,
  feedbackSubmissions,
  users,
  type FeedbackSubmission,
  type FeedbackSubmissionStatus,
} from "@/lib/db/schema";
import { FEEDBACK_MODES, type FeedbackMode } from "@/lib/feedback/categories";
import { getInternalDownloadUrl, R2_PREFIXES } from "@/lib/r2";
import { isR2Configured } from "@/lib/upload/constants";

export {
  formatFeedbackEmailHistoryLine,
  type FeedbackEmailSendEvent,
} from "@/lib/admin/feedback-email-history";

export const feedbackSubmissionStatusSchema = z.enum(
  FEEDBACK_SUBMISSION_STATUSES,
);

export const FEEDBACK_STATUS_LABELS: Record<FeedbackSubmissionStatus, string> =
  {
    new: "New",
    triaged: "Triaged",
    "in-progress": "In progress",
    resolved: "Resolved",
  };

export const FEEDBACK_MODE_LABELS: Record<FeedbackMode, string> = {
  bug: "Bug report",
  feature: "Feature request",
};

export type AdminFeedbackListOptions = {
  status?: FeedbackSubmissionStatus | "all";
  mode?: FeedbackMode | "all";
  limit?: number;
};

export async function listAdminFeedbackSubmissions(
  options?: AdminFeedbackListOptions,
): Promise<FeedbackSubmission[]> {
  const db = getDb();
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 200);
  const conditions: SQL[] = [];

  if (options?.status && options.status !== "all") {
    conditions.push(eq(feedbackSubmissions.status, options.status));
  }
  if (options?.mode && options.mode !== "all") {
    conditions.push(eq(feedbackSubmissions.mode, options.mode));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db
    .select()
    .from(feedbackSubmissions)
    .where(where)
    .orderBy(desc(feedbackSubmissions.createdAt))
    .limit(limit);
}

export async function countAdminFeedbackByStatus(): Promise<
  Record<FeedbackSubmissionStatus, number>
> {
  const db = getDb();
  const rows = await db
    .select({
      status: feedbackSubmissions.status,
      value: sql<number>`count(*)`.mapWith(Number),
    })
    .from(feedbackSubmissions)
    .groupBy(feedbackSubmissions.status);

  const counts: Record<FeedbackSubmissionStatus, number> = {
    new: 0,
    triaged: 0,
    "in-progress": 0,
    resolved: 0,
  };
  for (const row of rows) {
    if (
      FEEDBACK_SUBMISSION_STATUSES.includes(
        row.status as FeedbackSubmissionStatus,
      )
    ) {
      counts[row.status as FeedbackSubmissionStatus] = row.value;
    }
  }
  return counts;
}

export async function getAdminFeedbackSubmission(
  id: string,
): Promise<FeedbackSubmission | null> {
  if (!id?.trim()) return null;
  const db = getDb();
  const [row] = await db
    .select()
    .from(feedbackSubmissions)
    .where(eq(feedbackSubmissions.id, id.trim()))
    .limit(1);
  return row ?? null;
}

/** First name for thank-you drafts (admin-only; never exposed on public APIs). */
export async function getFeedbackTesterFirstName(
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId?.trim()) return null;
  try {
    const db = getDb();
    const [row] = await db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId.trim()))
      .limit(1);
    const name = row?.displayName?.trim();
    if (!name) return null;
    return name.split(/\s+/)[0] ?? null;
  } catch {
    return null;
  }
}

export async function updateFeedbackSubmissionStatus(input: {
  id: string;
  status: FeedbackSubmissionStatus;
}): Promise<FeedbackSubmission | null> {
  const db = getDb();
  const [row] = await db
    .update(feedbackSubmissions)
    .set({
      status: input.status,
      updatedAt: new Date(),
    })
    .where(eq(feedbackSubmissions.id, input.id))
    .returning();
  return row ?? null;
}

/**
 * Short-lived admin-only screenshot URL. Returns null when missing / R2 off.
 */
export async function getFeedbackScreenshotUrl(
  screenshotKey: string | null | undefined,
): Promise<string | null> {
  if (!screenshotKey?.trim() || !isR2Configured()) return null;
  if (!screenshotKey.startsWith(R2_PREFIXES.betaFeedback)) {
    console.warn("[admin.feedback] refusing non-feedback screenshot key");
    return null;
  }
  try {
    const signed = await getInternalDownloadUrl(screenshotKey, 60 * 10);
    return signed.url;
  } catch (error) {
    console.warn("[admin.feedback] screenshot sign failed", error);
    return null;
  }
}

export function isFeedbackMode(value: string): value is FeedbackMode {
  return (FEEDBACK_MODES as readonly string[]).includes(value);
}

/**
 * Load send-log events (auto-ack + admin replies) for many tickets.
 * Admin-only consumers — backed by admin_audit_logs.
 */
export async function listFeedbackEmailEventsBySubmissionIds(
  submissionIds: string[],
): Promise<Map<string, FeedbackEmailSendEvent[]>> {
  const result = new Map<string, FeedbackEmailSendEvent[]>();
  const ids = [...new Set(submissionIds.map((id) => id.trim()).filter(Boolean))];
  for (const id of ids) result.set(id, []);
  if (ids.length === 0) return result;

  const db = getDb();
  const rows = await db
    .select({
      targetId: adminAuditLogs.targetId,
      action: adminAuditLogs.action,
      createdAt: adminAuditLogs.createdAt,
    })
    .from(adminAuditLogs)
    .where(
      and(
        eq(adminAuditLogs.targetType, "feedback_submission"),
        inArray(adminAuditLogs.targetId, ids),
        inArray(adminAuditLogs.action, [
          FEEDBACK_EMAIL_ACK_ACTION,
          FEEDBACK_EMAIL_REPLY_ACTION,
        ]),
      ),
    )
    .orderBy(asc(adminAuditLogs.createdAt));

  for (const row of rows) {
    const kind = feedbackEmailActionToKind(row.action);
    if (!kind) continue;
    const list = result.get(row.targetId) ?? [];
    list.push({ kind, at: row.createdAt });
    result.set(row.targetId, list);
  }

  return result;
}

export async function getFeedbackEmailHistoryLines(
  submissionIds: string[],
): Promise<Map<string, string>> {
  const eventsById =
    await listFeedbackEmailEventsBySubmissionIds(submissionIds);
  const lines = new Map<string, string>();
  for (const [id, events] of eventsById) {
    lines.set(id, formatFeedbackEmailHistoryLine(events));
  }
  return lines;
}
