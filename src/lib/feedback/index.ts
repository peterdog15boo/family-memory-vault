export {
  FEEDBACK_CATEGORIES,
  FEEDBACK_MODES,
  FEEDBACK_SEVERITIES,
  categoryFromPathname,
  isFeedbackCategory,
  normalizeFeedbackPath,
} from "@/lib/feedback/categories";
export type {
  FeedbackCategory,
  FeedbackMode,
  FeedbackSeverity,
} from "@/lib/feedback/categories";
export {
  collectFeedbackContext,
  type FeedbackClientContext,
} from "@/lib/feedback/context";
export {
  ensureConsoleErrorBuffer,
  getRecentConsoleErrors,
} from "@/lib/feedback/console-buffer";
export { isBetaFeedbackEnabled } from "@/lib/feedback/flags";
export { FEEDBACK_OPEN_EVENT, openFeedback } from "@/lib/feedback/open";
export type { FeedbackOpenDetail } from "@/lib/feedback/open";
export { formatFeedbackDebugText } from "@/lib/feedback/debug-text";
export {
  createFeedbackSubmission,
  createBetaFeedback,
  listRecentFeedbackForUser,
} from "@/lib/feedback/submit";
export type {
  CreateFeedbackSubmissionInput,
  CreateBetaFeedbackInput,
  FeedbackHistoryItem,
} from "@/lib/feedback/submit";
export {
  notifyFeedbackSubmission,
  acknowledgeFeedbackSubmission,
  getFeedbackNotifyEmails,
} from "@/lib/feedback/notify";
export { generateFeedbackTicketId } from "@/lib/feedback/ticket";
export {
  captureViewportScreenshot,
  compressScreenshot,
  screenshotFromClipboardEvent,
  screenshotFromFile,
} from "@/lib/feedback/screenshot";
export type { FeedbackScreenshot } from "@/lib/feedback/screenshot";
export { FEEDBACK_SCREENSHOT_MAX_BYTES } from "@/lib/feedback/screenshot-limits";
