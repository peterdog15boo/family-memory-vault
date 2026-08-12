/**
 * Persist FeedbackSubmission rows (server-only).
 */

import { nanoid } from "nanoid";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  feedbackSubmissions,
  type FeedbackSubmission,
  type FeedbackSubmissionContext,
} from "@/lib/db/schema";
import type {
  FeedbackMode,
  FeedbackSeverity,
} from "@/lib/feedback/categories";
import { generateFeedbackTicketId } from "@/lib/feedback/ticket";

export type CreateFeedbackSubmissionInput = {
  userId: string;
  email?: string | null;
  mode: FeedbackMode;
  title: string;
  description: string;
  expectedBehavior?: string | null;
  severity?: FeedbackSeverity | null;
  problemStatement?: string | null;
  suggestedSolution?: string | null;
  category: string;
  pathname: string;
  pageUrl: string;
  browser?: string | null;
  os?: string | null;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  devicePixelRatio?: number | null;
  consoleErrors?: string[];
  userAgent?: string | null;
  clientTimestamp?: string | null;
  screenshotKey?: string | null;
  screenshotContentType?: string | null;
};

export type CreateBetaFeedbackInput = CreateFeedbackSubmissionInput;

function buildContext(
  input: CreateFeedbackSubmissionInput,
): FeedbackSubmissionContext {
  return {
    url: input.pageUrl,
    pathname: input.pathname,
    category: input.category,
    browser: input.browser ?? undefined,
    os: input.os ?? undefined,
    viewportWidth: input.viewportWidth ?? null,
    viewportHeight: input.viewportHeight ?? null,
    devicePixelRatio: input.devicePixelRatio ?? null,
    userAgent: input.userAgent ?? null,
    timestamp: input.clientTimestamp ?? null,
    consoleErrors: (input.consoleErrors ?? []).slice(0, 20),
    userId: input.userId,
    email: input.email ?? null,
    screenshotKey: input.screenshotKey ?? null,
    screenshotContentType: input.screenshotContentType ?? null,
  };
}

export async function createFeedbackSubmission(
  input: CreateFeedbackSubmissionInput,
): Promise<FeedbackSubmission> {
  const db = getDb();
  const now = new Date();
  const clientTs = input.clientTimestamp
    ? new Date(input.clientTimestamp)
    : null;
  const context = buildContext(input);

  // Rare ticket collision — retry a few times.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const ticketId = generateFeedbackTicketId();
    try {
      const [row] = await db
        .insert(feedbackSubmissions)
        .values({
          id: nanoid(),
          ticketId,
          userId: input.userId,
          email: input.email?.trim() || null,
          mode: input.mode,
          title: input.title.trim(),
          description: input.description.trim(),
          expectedBehavior: input.expectedBehavior?.trim() || null,
          severity: input.severity ?? null,
          problemStatement: input.problemStatement?.trim() || null,
          suggestedSolution: input.suggestedSolution?.trim() || null,
          category: input.category.trim(),
          status: "new",
          pathname: input.pathname.trim(),
          pageUrl: input.pageUrl.trim(),
          browser: input.browser?.trim() || null,
          os: input.os?.trim() || null,
          viewportWidth: input.viewportWidth ?? null,
          viewportHeight: input.viewportHeight ?? null,
          devicePixelRatio: input.devicePixelRatio ?? null,
          consoleErrors: (input.consoleErrors ?? []).slice(0, 20),
          context,
          userAgent: input.userAgent?.slice(0, 512) || null,
          clientTimestamp:
            clientTs && !Number.isNaN(clientTs.getTime()) ? clientTs : null,
          screenshotKey: input.screenshotKey ?? null,
          screenshotContentType: input.screenshotContentType ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (!row) {
        throw new Error("Failed to save feedback submission");
      }
      return row;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/ticket_id|unique/i.test(message)) throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to allocate feedback ticket id");
}

export type FeedbackHistoryItem = {
  id: string;
  ticketId: string;
  mode: string;
  title: string;
  status: string;
  category: string;
  createdAt: string;
};

/**
 * Recent submissions for the signed-in user (newest first).
 */
export async function listRecentFeedbackForUser(
  userId: string,
  limit = 5,
): Promise<FeedbackHistoryItem[]> {
  if (!userId) return [];
  const db = getDb();
  const take = Math.min(Math.max(limit, 1), 10);

  const rows = await db
    .select({
      id: feedbackSubmissions.id,
      ticketId: feedbackSubmissions.ticketId,
      mode: feedbackSubmissions.mode,
      title: feedbackSubmissions.title,
      status: feedbackSubmissions.status,
      category: feedbackSubmissions.category,
      createdAt: feedbackSubmissions.createdAt,
    })
    .from(feedbackSubmissions)
    .where(eq(feedbackSubmissions.userId, userId))
    .orderBy(desc(feedbackSubmissions.createdAt))
    .limit(take);

  return rows.map((row) => ({
    id: row.id,
    ticketId: row.ticketId,
    mode: row.mode,
    title: row.title,
    status: row.status,
    category: row.category,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** @deprecated Use createFeedbackSubmission */
export const createBetaFeedback = createFeedbackSubmission;
