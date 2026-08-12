/**
 * Open the in-app feedback modal from anywhere in the authenticated shell.
 */

import type { FeedbackMode } from "@/lib/feedback/categories";

export const FEEDBACK_OPEN_EVENT = "fmv:feedback-open";

export type FeedbackOpenDetail = {
  mode?: FeedbackMode;
};

export function openFeedback(detail?: FeedbackOpenDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<FeedbackOpenDetail>(FEEDBACK_OPEN_EVENT, {
      detail: detail ?? {},
    }),
  );
}
