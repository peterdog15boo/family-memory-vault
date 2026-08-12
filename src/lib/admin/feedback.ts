/**
 * Admin helpers for beta FeedbackSubmission triage.
 */

import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  FEEDBACK_SUBMISSION_STATUSES,
  feedbackSubmissions,
  type FeedbackSubmission,
  type FeedbackSubmissionStatus,
} from "@/lib/db/schema";
import { FEEDBACK_MODES, type FeedbackMode } from "@/lib/feedback/categories";
import { getInternalDownloadUrl, R2_PREFIXES } from "@/lib/r2";
import { isR2Configured } from "@/lib/upload/constants";

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
