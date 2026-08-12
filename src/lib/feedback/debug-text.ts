/**
 * Format auto-collected feedback context as a pasteable debug block.
 */

import type { FeedbackClientContext } from "@/lib/feedback/context";

export function formatFeedbackDebugText(
  context: FeedbackClientContext,
): string {
  const lines = [
    "Family Memory Vault — beta feedback debug info",
    "---------------------------------------------",
    `URL: ${context.url}`,
    `Path: ${context.pathname}`,
    `Category: ${context.category}`,
    `Browser: ${context.browser}`,
    `OS: ${context.os}`,
    `Viewport: ${context.viewportWidth}×${context.viewportHeight} @${context.devicePixelRatio}x`,
    `User ID: ${context.userId ?? "(signed out)"}`,
    `Email: ${context.email ?? "(none)"}`,
    `Timestamp: ${context.timestamp}`,
    `User-Agent: ${context.userAgent || "(unknown)"}`,
    "",
    "Recent console errors:",
    context.consoleErrors.length
      ? context.consoleErrors.map((line) => `- ${line}`).join("\n")
      : "- (none captured)",
  ];
  return lines.join("\n");
}
