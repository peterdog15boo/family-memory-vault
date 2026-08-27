/**
 * Compact one-line summaries of feedback reporter emails
 * (auto-ack + admin follow-ups) from admin audit send logs.
 */

export const FEEDBACK_EMAIL_ACK_ACTION = "feedback.email_ack";
export const FEEDBACK_EMAIL_REPLY_ACTION = "feedback.email_reply";

export type FeedbackEmailSendKind = "ack" | "follow_up";

export type FeedbackEmailSendEvent = {
  kind: FeedbackEmailSendKind;
  at: Date;
};

export function feedbackEmailActionToKind(
  action: string,
): FeedbackEmailSendKind | null {
  if (action === FEEDBACK_EMAIL_ACK_ACTION) return "ack";
  if (action === FEEDBACK_EMAIL_REPLY_ACTION) return "follow_up";
  return null;
}

function formatEmailWhen(date: Date): string {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatEmailDay(date: Date): string {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * One compact line for Admin Feedback list/detail.
 *
 * Examples:
 * - "No email sent yet"
 * - "Ack sent Aug 27, 2:12 AM"
 * - "Ack sent Aug 27 · Follow-up sent Aug 27, 4:05 PM"
 * - "Ack sent Aug 27 · 2 follow-ups · last Aug 27, 4:05 PM"
 */
export function formatFeedbackEmailHistoryLine(
  events: FeedbackEmailSendEvent[],
): string {
  if (events.length === 0) return "No email sent yet";

  const sorted = [...events].sort(
    (a, b) => a.at.getTime() - b.at.getTime(),
  );
  const ack = sorted.find((e) => e.kind === "ack");
  const followUps = sorted.filter((e) => e.kind === "follow_up");
  const last = sorted[sorted.length - 1]!;

  if (ack && followUps.length === 0) {
    return `Ack sent ${formatEmailWhen(ack.at)}`;
  }

  if (ack && followUps.length === 1) {
    return `Ack sent ${formatEmailDay(ack.at)} · Follow-up sent ${formatEmailWhen(followUps[0]!.at)}`;
  }

  if (ack && followUps.length > 1) {
    return `Ack sent ${formatEmailDay(ack.at)} · ${followUps.length} follow-ups · last ${formatEmailWhen(last.at)}`;
  }

  // Follow-ups only (legacy tickets before auto-ack logging).
  if (followUps.length === 1) {
    return `Follow-up sent ${formatEmailWhen(followUps[0]!.at)}`;
  }

  if (followUps.length > 1) {
    return `${followUps.length} emails · last ${formatEmailWhen(last.at)}`;
  }

  return `Ack sent ${formatEmailWhen(last.at)}`;
}
