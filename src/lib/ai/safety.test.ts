import { describe, expect, it } from "vitest";
import {
  ASSISTANT_CREATE_MEDIA_LIMIT,
  publicAssistantErrorMessage,
  shouldClarifyBeforeCreate,
  shouldClarifyBeforeSearch,
} from "@/lib/ai/safety";
import type { AssistantIntent } from "@/lib/assistant/types";
import type { ResolvedIntent } from "@/lib/ai/resolve";

function intent(partial?: Partial<AssistantIntent>): AssistantIntent {
  return {
    action: "create_movie",
    people: [],
    raw_prompt: "make a movie",
    ...partial,
  };
}

function resolved(partial?: Partial<ResolvedIntent>): ResolvedIntent {
  return {
    intent: intent(),
    peopleIds: [],
    matchedPeople: [],
    unresolvedPeople: [],
    dateFilter: null,
    needsClarification: false,
    clarifyingQuestions: [],
    ...partial,
  };
}

describe("assistant safety", () => {
  it("requires people or time before creates", () => {
    expect(
      shouldClarifyBeforeCreate(intent({ action: "create_memory" }), resolved()),
    ).toBe(true);

    expect(
      shouldClarifyBeforeCreate(
        intent({ action: "create_movie" }),
        resolved({
          peopleIds: ["p1"],
          matchedPeople: [
            { id: "p1", name: "Noah", matchedOn: "Noah", score: 1 },
          ],
        }),
      ),
    ).toBe(false);

    expect(
      shouldClarifyBeforeCreate(
        intent({ action: "search_media" }),
        resolved(),
      ),
    ).toBe(false);
  });

  it("requires people or time before unscoped searches", () => {
    expect(
      shouldClarifyBeforeSearch(
        intent({ action: "search_media", raw_prompt: "show me photos" }),
        resolved(),
      ),
    ).toBe(true);

    expect(
      shouldClarifyBeforeSearch(
        intent({ action: "search_media", raw_prompt: "show me photos" }),
        resolved({ peopleIds: ["p1"] }),
      ),
    ).toBe(false);

    expect(
      shouldClarifyBeforeSearch(
        intent({
          action: "search_media",
          raw_prompt: "show me photos from last summer",
        }),
        resolved({
          dateFilter: {
            label: "last summer",
            start: "2025-06-01",
            end: "2025-08-31",
            isConcrete: true,
          },
        }),
      ),
    ).toBe(false);

    expect(
      shouldClarifyBeforeSearch(
        intent({
          action: "search_media",
          raw_prompt: "show me all my photos",
        }),
        resolved(),
      ),
    ).toBe(false);

    expect(
      shouldClarifyBeforeSearch(
        intent({
          action: "search_media",
          raw_prompt: "show me a person smoking a cigar",
          qualities: ["smoking", "cigar"],
        }),
        resolved(),
      ),
    ).toBe(false);

    expect(
      shouldClarifyBeforeSearch(
        intent({
          action: "search_media",
          raw_prompt: "images with inflatable obstacle courses",
          visual_query: "inflatable obstacle courses",
          objects: ["inflatable", "obstacle course"],
        }),
        resolved(),
      ),
    ).toBe(false);
  });

  it("allows creates scoped by visual object/scene focus", () => {
    expect(
      shouldClarifyBeforeCreate(
        intent({
          action: "create_movie",
          raw_prompt: "slideshow of bounce house photos",
          visual_query: "bounce house",
          objects: ["bounce house"],
        }),
        resolved(),
      ),
    ).toBe(false);
  });

  it("sanitizes internal errors for users", () => {
    expect(
      publicAssistantErrorMessage(new Error("relation assistant_foo does not exist")),
    ).toMatch(/couldn’t finish that safely|try again/i);

    expect(
      publicAssistantErrorMessage(new Error("Conversation not found.")),
    ).toMatch(/couldn’t find/i);
  });

  it("caps create media batches", () => {
    expect(ASSISTANT_CREATE_MEDIA_LIMIT).toBeLessThanOrEqual(48);
  });

  it("keeps the highest-sensitivity tables out of assistant scope", async () => {
    const { ASSISTANT_EXCLUDED_DATA_DOMAINS } = await import("@/lib/ai/safety");
    expect(ASSISTANT_EXCLUDED_DATA_DOMAINS).toContain("legacy_secure_items");
    expect(ASSISTANT_EXCLUDED_DATA_DOMAINS).toContain(
      "emergency_access_designations",
    );
    expect(ASSISTANT_EXCLUDED_DATA_DOMAINS).toContain("sensitive_access_events");
    expect(ASSISTANT_EXCLUDED_DATA_DOMAINS).toContain("plaid_items");
    expect(ASSISTANT_EXCLUDED_DATA_DOMAINS).toContain("linked_accounts");
    expect(ASSISTANT_EXCLUDED_DATA_DOMAINS).toContain(
      "linked_account_holdings",
    );
  });
});
