import { describe, expect, it } from "vitest";
import { shouldSkipModerationRescan } from "@/lib/moderation/job-gate";
import {
  hasProcessingFailedLabel,
  processingFailedDetail,
  processingFailedModerationResult,
} from "@/lib/moderation/processing-failed";

describe("processing_failed helpers", () => {
  it("detects the processing_failed label", () => {
    expect(hasProcessingFailedLabel({ labels: ["processing_failed"] })).toBe(
      true,
    );
    expect(hasProcessingFailedLabel({ labels: ["Explicit Nudity"] })).toBe(
      false,
    );
    expect(hasProcessingFailedLabel(null)).toBe(false);
  });

  it("surfaces vendor lastError for admin review", () => {
    expect(
      processingFailedDetail({
        labels: ["processing_failed"],
        raw: {
          lastError:
            "[AI-Moderation:rekognition] Member must have length less than or equal to 5242880",
        },
      }),
    ).toMatch(/5242880/);
    expect(processingFailedDetail({ labels: ["Explicit Nudity"] })).toBeNull();
  });

  it("builds a review-bound result, not a policy reject payload", () => {
    const result = processingFailedModerationResult({
      attempts: 5,
      maxAttempts: 5,
      lastError: "PhotoDNA timeout",
    });
    expect(result.labels?.labels).toContain("processing_failed");
    expect(result.notes).toMatch(/human review/i);
    expect(result.photodnaMatch).toBe(false);
  });

  it("does not treat scanner failure as a terminal skip", () => {
    const skip = shouldSkipModerationRescan({
      moderationStatus: "needs_human_review",
      status: "pending_moderation",
      originalKey: "temp/user/a.jpg",
      moderationLabels: { labels: ["processing_failed"] },
    });
    expect(skip.handled).toBe(false);

    const rejectedFail = shouldSkipModerationRescan({
      moderationStatus: "rejected",
      status: "rejected",
      originalKey: "originals/user/a.jpg",
      moderationLabels: { labels: ["processing_failed"] },
    });
    expect(rejectedFail.handled).toBe(false);
  });

  it("still skips real policy rejects and scored review items", () => {
    expect(
      shouldSkipModerationRescan({
        moderationStatus: "rejected",
        status: "rejected",
        originalKey: "originals/user/a.jpg",
        moderationLabels: { labels: ["Violence"] },
      }).handled,
    ).toBe(true);

    expect(
      shouldSkipModerationRescan({
        moderationStatus: "needs_human_review",
        status: "pending_moderation",
        originalKey: "temp/user/a.jpg",
        moderationLabels: { labels: ["Suggestive"] },
      }).handled,
    ).toBe(true);

    expect(
      shouldSkipModerationRescan({
        moderationStatus: "csam_quarantined",
        status: "csam_quarantined",
        ncmecReportId: "rpt_1",
        originalKey: "quarantine/user/a.jpg",
        moderationLabels: { labels: ["processing_failed"] },
      }).handled,
    ).toBe(true);
  });
});
