import { describe, expect, it } from "vitest";
import {
  isCancelMessage,
  isConfirmMessage,
  mergeClarificationIntent,
} from "@/lib/ai/assistant";
import type { AssistantIntent } from "@/lib/assistant/types";

function baseIntent(partial?: Partial<AssistantIntent>): AssistantIntent {
  return {
    action: "create_movie",
    people: ["Craig"],
    tone: "memorial",
    qualities: ["humor", "depth"],
    theme_preference: "cinematic",
    raw_prompt: "Create a memorial tribute for Craig highlighting his humor and depth",
    ...partial,
  };
}

describe("confirmation helpers", () => {
  it("detects confirmations", () => {
    expect(isConfirmMessage("Yes")).toBe(true);
    expect(isConfirmMessage("go ahead")).toBe(true);
    expect(isConfirmMessage("looks good!")).toBe(true);
    expect(isConfirmMessage("maybe later")).toBe(false);
  });

  it("detects cancellations", () => {
    expect(isCancelMessage("Cancel")).toBe(true);
    expect(isCancelMessage("never mind")).toBe(true);
    expect(isCancelMessage("yes")).toBe(false);
  });
});

describe("mergeClarificationIntent", () => {
  it("merges a year clarification into the prior memorial request", async () => {
    const merged = await mergeClarificationIntent({
      previous: baseIntent({
        date_range: { label: "7th grade" },
        action: "create_movie",
      }),
      reply: "use 2022",
      preferFallback: true,
    });

    expect(merged.action).toBe("create_movie");
    expect(merged.people).toContain("Craig");
    expect(merged.tone).toBe("memorial");
    expect(merged.date_range?.label === "2022" || merged.date_range?.start?.startsWith("2022")).toBe(
      true,
    );
    expect(merged.raw_prompt).toMatch(/User clarification/i);
  });

  it("keeps prior plan on a bare yes during clarify", async () => {
    const merged = await mergeClarificationIntent({
      previous: baseIntent(),
      reply: "Yes",
      preferFallback: true,
    });
    expect(merged.people).toEqual(["Craig"]);
    expect(merged.action).toBe("create_movie");
    expect(merged.tone).toBe("memorial");
  });

  it("merges a category name into a private document request", async () => {
    const merged = await mergeClarificationIntent({
      previous: {
        action: "create_document_category",
        people: [],
        raw_prompt: "Create a category for private documents",
      },
      reply: "Call it Contracts",
      preferFallback: true,
    });

    expect(merged.action).toBe("create_document_category");
    expect(merged.document_category).toBe("Contracts");
  });
});
