import { describe, expect, it } from "vitest";
import {
  buildFeedbackReplyDraft,
  feedbackReplySubject,
  feedbackReplyTemplateBody,
} from "@/lib/admin/feedback-reply";

describe("feedback reply drafts", () => {
  it("uses bug copy by default", () => {
    expect(feedbackReplySubject("bug")).toMatch(/reporting/i);
    expect(feedbackReplyTemplateBody("bug")).toMatch(/bug/i);
    const draft = buildFeedbackReplyDraft({ mode: "bug", testerName: "Alex" });
    expect(draft.subject).toBe(feedbackReplySubject("bug"));
    expect(draft.body).toContain("Hi Alex,");
    expect(draft.body).toContain(draft.templateBody);
    expect(draft.body).not.toContain("feature request");
  });

  it("uses feature copy for feature mode", () => {
    const draft = buildFeedbackReplyDraft({ mode: "feature" });
    expect(draft.subject).toBe(feedbackReplySubject("feature"));
    expect(draft.body).toContain("Hi,");
    expect(draft.body).toMatch(/feature request/i);
  });

  it("inserts an optional personal note after the greeting", () => {
    const draft = buildFeedbackReplyDraft({
      mode: "bug",
      testerName: "Sam",
      personalNote: "We saw your screenshot — thank you.",
    });
    const lines = draft.body.split("\n");
    expect(lines[0]).toBe("Hi Sam,");
    expect(draft.body).toContain("We saw your screenshot — thank you.");
    expect(draft.body.indexOf("We saw")).toBeLessThan(
      draft.body.indexOf(draft.templateBody),
    );
  });
});
