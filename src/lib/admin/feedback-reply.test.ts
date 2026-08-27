import { describe, expect, it } from "vitest";
import {
  buildFeedbackReplyDraft,
  FEEDBACK_REPLY_SIGNATURE,
  feedbackReplySubject,
  feedbackReplyTemplateBody,
  formatFeedbackOriginalReport,
} from "@/lib/admin/feedback-reply";

const sampleReport = {
  ticketId: "FMV-A1B2C3",
  mode: "bug" as const,
  title: "Upload failed",
  description: "Photos never finish uploading.",
  expectedBehavior: "They should complete.",
  pageUrl: "https://familymemoryvault.ai/upload",
  submittedAt: new Date("2026-08-27T12:00:00Z"),
};

describe("feedback reply drafts", () => {
  it("uses bug copy by default", () => {
    expect(feedbackReplySubject("bug")).toMatch(/reporting/i);
    expect(feedbackReplyTemplateBody("bug")).toMatch(/bug/i);
    const draft = buildFeedbackReplyDraft({
      mode: "bug",
      testerName: "Alex",
      report: sampleReport,
    });
    expect(draft.subject).toBe(feedbackReplySubject("bug"));
    expect(draft.body).toContain("Hi Alex,");
    expect(draft.body).toContain(draft.templateBody);
    expect(draft.body).toContain("FMV-A1B2C3");
    expect(draft.body).toContain(FEEDBACK_REPLY_SIGNATURE);
    expect(draft.body).not.toContain("feature request");
  });

  it("uses feature copy for feature mode", () => {
    const draft = buildFeedbackReplyDraft({
      mode: "feature",
      report: { ...sampleReport, mode: "feature" },
    });
    expect(draft.subject).toBe(feedbackReplySubject("feature"));
    expect(draft.body).toContain("Hi,");
    expect(draft.body).toMatch(/feature request/i);
    expect(draft.body).toContain("Type: Feature request");
  });

  it("inserts an optional personal note after the thank-you", () => {
    const draft = buildFeedbackReplyDraft({
      mode: "bug",
      testerName: "Sam",
      personalNote: "We saw your screenshot — thank you.",
      report: sampleReport,
    });
    expect(draft.body.startsWith("Hi Sam,")).toBe(true);
    expect(draft.body).toContain("We saw your screenshot — thank you.");
    expect(draft.body.indexOf(draft.templateBody)).toBeLessThan(
      draft.body.indexOf("We saw"),
    );
    expect(draft.body.indexOf("We saw")).toBeLessThan(
      draft.body.indexOf("Original report"),
    );
  });

  it("formats a quoted original report block", () => {
    const block = formatFeedbackOriginalReport(sampleReport);
    expect(block).toContain("---");
    expect(block).toContain("Original report");
    expect(block).toContain("Type: Bug");
    expect(block).toContain("Ticket: FMV-A1B2C3");
    expect(block).toContain("Photos never finish uploading.");
    expect(block).toContain("Expected:");
  });

  it("ends with the development team signature", () => {
    const draft = buildFeedbackReplyDraft({ mode: "bug", report: sampleReport });
    expect(draft.body.trim().endsWith(FEEDBACK_REPLY_SIGNATURE)).toBe(true);
    expect(draft.body).toContain("support@mail.familymemoryvault.ai");
    expect(draft.body).toContain("https://familymemoryvault.ai");
  });
});
