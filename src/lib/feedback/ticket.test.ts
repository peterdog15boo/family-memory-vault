import { describe, expect, it } from "vitest";
import { generateFeedbackTicketId } from "@/lib/feedback/ticket";

describe("generateFeedbackTicketId", () => {
  it("returns FMV- prefix with 6 unambiguous chars", () => {
    const id = generateFeedbackTicketId();
    expect(id).toMatch(/^FMV-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it("generates unique values across a small sample", () => {
    const set = new Set(Array.from({ length: 40 }, () => generateFeedbackTicketId()));
    expect(set.size).toBe(40);
  });
});
