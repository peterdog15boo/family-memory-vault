import { describe, expect, it } from "vitest";
import {
  mergeMediaTagEntries,
  normalizeDismissedAiTags,
  normalizeUserTags,
  suppressDismissedLabels,
} from "@/lib/media/tags";
import { roleHasCapability } from "@/lib/permissions";

describe("normalizeUserTags", () => {
  it("trims, lowercases, and dedupes case-insensitively", () => {
    expect(normalizeUserTags(["  Cake ", "cake", "BIRTHDAY", "birthday"])).toEqual([
      "cake",
      "birthday",
    ]);
  });

  it("drops empty and oversized tokens", () => {
    expect(normalizeUserTags(["", "  ", "a".repeat(60), "ok"])).toEqual(["ok"]);
  });

  it("collapses internal whitespace", () => {
    expect(normalizeUserTags(["beach   day"])).toEqual(["beach day"]);
  });
});

describe("dismissed AI tags", () => {
  it("suppresses dismissed labels case-insensitively", () => {
    expect(
      suppressDismissedLabels(["Cake", "party", "beach"], ["cake", "BEACH"]),
    ).toEqual(["party"]);
  });

  it("normalizes dismissed lists", () => {
    expect(normalizeDismissedAiTags(["  Cake ", "cake", "party"])).toEqual([
      "cake",
      "party",
    ]);
  });

  it("hides dismissed AI labels from merged UI entries", () => {
    const merged = mergeMediaTagEntries({
      aiTags: ["cake", "party"],
      aiObjects: ["cake", "balloon"],
      userTags: ["grandma"],
      dismissedAiTags: ["cake"],
    });
    expect(merged).toEqual([
      { value: "party", source: "ai" },
      { value: "balloon", source: "ai" },
      { value: "grandma", source: "user" },
    ]);
  });

  it("still shows a user tag even if the same label was dismissed from AI", () => {
    const merged = mergeMediaTagEntries({
      aiTags: ["cake"],
      userTags: ["cake"],
      dismissedAiTags: ["cake"],
    });
    expect(merged).toEqual([{ value: "cake", source: "user" }]);
  });
});

describe("mergeMediaTagEntries", () => {
  it("keeps AI and user sources distinguishable and dedupes across sources", () => {
    const merged = mergeMediaTagEntries({
      aiTags: ["cake", "party"],
      aiObjects: ["cake"],
      userTags: ["Cake", "grandma"],
    });
    expect(merged).toEqual([
      { value: "cake", source: "ai" },
      { value: "party", source: "ai" },
      { value: "grandma", source: "user" },
    ]);
  });
});

describe("shared media tag edit policy", () => {
  it("allows contribute roles to edit; viewers stay read-only", () => {
    expect(roleHasCapability("owner", "contribute")).toBe(true);
    expect(roleHasCapability("member", "contribute")).toBe(true);
    expect(roleHasCapability("viewer", "contribute")).toBe(false);
    expect(roleHasCapability("viewer", "view")).toBe(true);
  });
});
