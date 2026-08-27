/**
 * Full thank-you / acknowledgment drafts for feedback reporters.
 * Used by Admin compose/copy and by the automatic first reply on submit.
 */

import type { FeedbackMode } from "@/lib/feedback/categories";

export const FEEDBACK_REPLY_SIGNATURE = [
  "Family Memory Vault Development Team",
  "support@mail.familymemoryvault.ai",
  "https://familymemoryvault.ai",
].join("\n");

export type FeedbackReplyReport = {
  ticketId: string;
  mode: FeedbackMode | string;
  title?: string | null;
  description?: string | null;
  expectedBehavior?: string | null;
  problemStatement?: string | null;
  suggestedSolution?: string | null;
  pageUrl?: string | null;
  pathname?: string | null;
  submittedAt?: Date | string | null;
};

export type FeedbackReplyDraft = {
  subject: string;
  /** Full plain-text body ready to send/copy. */
  body: string;
  /** Thank-you paragraph only (bug vs feature). */
  templateBody: string;
};

function greetingLine(testerName?: string | null): string {
  const name = testerName?.trim();
  if (!name) return "Hi,";
  return `Hi ${name},`;
}

export function feedbackReplyTemplateBody(mode: FeedbackMode): string {
  if (mode === "feature") {
    return "Thank you for noting this feature request. We are reviewing it and will let you know when you can try it.";
  }
  return "Thank you for noting this bug. We are working on a solution and will let you know when you can try again.";
}

export function feedbackReplySubject(mode: FeedbackMode): string {
  if (mode === "feature") {
    return "Thanks for the Family Memory Vault suggestion";
  }
  return "Thanks for reporting this in Family Memory Vault";
}

function normalizeMode(mode: FeedbackMode | string): FeedbackMode {
  return mode === "feature" ? "feature" : "bug";
}

function typeLabel(mode: FeedbackMode): string {
  return mode === "feature" ? "Feature request" : "Bug";
}

function formatSubmittedAt(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function quoteBlock(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '""';
  return `"${trimmed}"`;
}

/**
 * Standard email-style quoted original report for the bottom of the reply.
 */
export function formatFeedbackOriginalReport(
  report: FeedbackReplyReport,
): string {
  const mode = normalizeMode(report.mode);
  const page =
    report.pageUrl?.trim() ||
    report.pathname?.trim() ||
    "—";

  const detailParts: string[] = [];
  if (report.title?.trim()) {
    detailParts.push(quoteBlock(report.title));
  }
  if (report.description?.trim()) {
    detailParts.push(quoteBlock(report.description));
  }
  if (report.expectedBehavior?.trim()) {
    detailParts.push(`Expected: ${quoteBlock(report.expectedBehavior)}`);
  }
  if (report.problemStatement?.trim()) {
    detailParts.push(`Problem: ${quoteBlock(report.problemStatement)}`);
  }
  if (report.suggestedSolution?.trim()) {
    detailParts.push(`Suggested: ${quoteBlock(report.suggestedSolution)}`);
  }

  const lines = [
    "---",
    "Original report",
    `Type: ${typeLabel(mode)}`,
    `Ticket: ${report.ticketId.trim() || "—"}`,
    `Submitted: ${formatSubmittedAt(report.submittedAt)}`,
    `Page: ${page}`,
    "",
    ...(detailParts.length > 0 ? detailParts : [quoteBlock("")]),
    "---",
  ];

  return lines.join("\n");
}

/**
 * Build a complete type-aware thank-you email draft:
 * greeting → thank-you → optional personal note → quoted report → signature.
 */
export function buildFeedbackReplyDraft(input: {
  mode: FeedbackMode | string;
  testerName?: string | null;
  personalNote?: string | null;
  report?: FeedbackReplyReport | null;
}): FeedbackReplyDraft {
  const mode = normalizeMode(input.mode);
  const subject = feedbackReplySubject(mode);
  const templateBody = feedbackReplyTemplateBody(mode);
  const greeting = greetingLine(input.testerName);
  const note = input.personalNote?.trim();

  const parts: string[] = [greeting, "", templateBody];

  if (note) {
    parts.push("", note);
  }

  if (input.report) {
    parts.push("", formatFeedbackOriginalReport(input.report));
  }

  parts.push("", FEEDBACK_REPLY_SIGNATURE);

  return {
    subject,
    templateBody,
    body: parts.join("\n"),
  };
}
