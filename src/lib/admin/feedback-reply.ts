/**
 * Admin thank-you drafts for feedback reporters (bug vs feature).
 */

import type { FeedbackMode } from "@/lib/feedback/categories";

export type FeedbackReplyDraft = {
  subject: string;
  /** Full plain-text body ready to send/copy (includes greeting). */
  body: string;
  /** Template paragraphs without greeting — for compose UI. */
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

/**
 * Build a type-aware thank-you draft for a feedback ticket.
 * Optional personalNote is inserted after the greeting.
 */
export function buildFeedbackReplyDraft(input: {
  mode: FeedbackMode | string;
  testerName?: string | null;
  personalNote?: string | null;
}): FeedbackReplyDraft {
  const mode: FeedbackMode = input.mode === "feature" ? "feature" : "bug";
  const subject = feedbackReplySubject(mode);
  const templateBody = feedbackReplyTemplateBody(mode);
  const greeting = greetingLine(input.testerName);
  const note = input.personalNote?.trim();

  const parts = [greeting, ""];
  if (note) {
    parts.push(note, "");
  }
  parts.push(templateBody);

  return {
    subject,
    templateBody,
    body: parts.join("\n"),
  };
}
