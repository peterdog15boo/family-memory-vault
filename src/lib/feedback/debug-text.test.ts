import { describe, expect, it } from "vitest";
import { formatFeedbackDebugText } from "@/lib/feedback/debug-text";
import type { FeedbackClientContext } from "@/lib/feedback/context";

describe("formatFeedbackDebugText", () => {
  it("includes core context fields in a pasteable block", () => {
    const context: FeedbackClientContext = {
      url: "http://localhost:3000/media",
      pathname: "/media",
      category: "Photos & Media",
      browser: "Chrome",
      os: "Windows",
      viewportWidth: 1280,
      viewportHeight: 720,
      devicePixelRatio: 1.5,
      userAgent: "Mozilla/5.0",
      timestamp: "2026-08-12T01:00:00.000Z",
      consoleErrors: ["2026-08-12T01:00:00.000Z boom"],
      userId: "user_123",
      email: "beta@example.com",
    };

    const text = formatFeedbackDebugText(context);
    expect(text).toContain("URL: http://localhost:3000/media");
    expect(text).toContain("Category: Photos & Media");
    expect(text).toContain("User ID: user_123");
    expect(text).toContain("- 2026-08-12T01:00:00.000Z boom");
  });
});
