import { describe, expect, it } from "vitest";
import { formatFeedbackEmailHistoryLine } from "@/lib/admin/feedback-email-history";

describe("formatFeedbackEmailHistoryLine", () => {
  it("shows empty state", () => {
    expect(formatFeedbackEmailHistoryLine([])).toBe("No email sent yet");
  });

  it("shows a single ack with time", () => {
    const line = formatFeedbackEmailHistoryLine([
      { kind: "ack", at: new Date("2026-08-27T07:12:00Z") },
    ]);
    expect(line).toMatch(/^Ack sent /);
    expect(line).toMatch(/Aug 27/);
  });

  it("shows ack plus one follow-up", () => {
    const line = formatFeedbackEmailHistoryLine([
      { kind: "ack", at: new Date("2026-08-27T07:12:00Z") },
      { kind: "follow_up", at: new Date("2026-08-27T21:05:00Z") },
    ]);
    expect(line).toContain("Ack sent");
    expect(line).toContain("Follow-up sent");
    expect(line).toContain("·");
  });

  it("includes follow-up count when more than one", () => {
    const line = formatFeedbackEmailHistoryLine([
      { kind: "ack", at: new Date("2026-08-27T07:12:00Z") },
      { kind: "follow_up", at: new Date("2026-08-27T15:00:00Z") },
      { kind: "follow_up", at: new Date("2026-08-27T21:05:00Z") },
    ]);
    expect(line).toContain("2 follow-ups");
    expect(line).toContain("last");
  });

  it("handles follow-ups without an ack", () => {
    const line = formatFeedbackEmailHistoryLine([
      { kind: "follow_up", at: new Date("2026-08-27T21:05:00Z") },
    ]);
    expect(line).toMatch(/^Follow-up sent /);
  });
});
