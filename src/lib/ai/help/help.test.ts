import { describe, expect, it } from "vitest";
import {
  formatSecondaryHelpTip,
  isMixedHelpAndMediaRequest,
  isProductHelpQuestion,
  retrieveHelpEntries,
  shouldOverrideWithProductHelp,
} from "@/lib/ai/help";

describe("product help retrieval", () => {
  it("ranks invite family for invite questions", () => {
    const entries = retrieveHelpEntries(
      "How do I invite family members to join?",
    );
    expect(entries[0]?.id).toBe("invite_family");
    expect(entries[0]?.relatedRoutes.some((r) => r.href === "/family")).toBe(
      true,
    );
  });

  it("ranks movie limits for monthly movie cap questions", () => {
    const entries = retrieveHelpEntries(
      "How can I make more than 5 movies per month?",
    );
    expect(entries[0]?.id).toBe("movie_limits");
    expect(entries[0]?.planAware).toBe(true);
    expect(entries[0]?.relatedRoutes.some((r) => r.href === "/billing")).toBe(
      true,
    );
  });

  it("ranks create memory for where-to questions", () => {
    expect(retrieveHelpEntries("Where do I create a Memory?")[0]?.id).toBe(
      "create_memory",
    );
  });

  it("ranks scanning for why photos delay", () => {
    expect(
      retrieveHelpEntries("Why don’t my photos show up right away?")[0]?.id,
    ).toBe("photo_scanning");
  });

  it("uses Photos label not Media", () => {
    const upload = retrieveHelpEntries("How do I upload photos?")[0];
    expect(upload?.summary).toMatch(/Photos/);
    expect(upload?.summary).not.toMatch(/\bMedia\b/);
  });
});

describe("product help intent helpers", () => {
  it("detects how-to vs media", () => {
    expect(isProductHelpQuestion("How do I invite family members?")).toBe(
      true,
    );
    expect(isProductHelpQuestion("Show me beach photos")).toBe(false);
    expect(
      isProductHelpQuestion(
        "find beach photos and tell me how to make a movie",
      ),
    ).toBe(false);
  });

  it("detects mixed help + media", () => {
    expect(
      isMixedHelpAndMediaRequest(
        "find beach photos and tell me how to make a movie",
      ),
    ).toBe(true);
    expect(isMixedHelpAndMediaRequest("How do I make a movie?")).toBe(false);
  });

  it("appends a movie tip for mixed prompts", () => {
    const tip = formatSecondaryHelpTip(
      "find beach photos and tell me how to make a movie",
    );
    expect(tip).toMatch(/Also —/);
    expect(tip).toMatch(/Movie|movie|Memory|Memories/);
  });

  it("overrides clarify/search with help for pure how-to", () => {
    expect(
      shouldOverrideWithProductHelp({
        action: "clarify",
        raw_prompt: "How do I change my avatar?",
      }),
    ).toBe(true);
    expect(
      shouldOverrideWithProductHelp({
        action: "create_movie",
        raw_prompt: "How can I make more than 5 movies per month?",
      }),
    ).toBe(true);
    expect(
      shouldOverrideWithProductHelp({
        action: "search_media",
        raw_prompt: "Show me beach photos",
      }),
    ).toBe(false);
  });
});
