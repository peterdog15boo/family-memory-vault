import { describe, expect, it } from "vitest";
import {
  resolveDateReference,
  resolveIntentWithCatalog,
  resolvePeopleNames,
} from "@/lib/ai/resolve";
import type { AssistantIntent } from "@/lib/assistant/types";

const catalog = [
  { id: "noah", name: "Noah Roberts" },
  { id: "craig", name: "Craig" },
  { id: "alex-s", name: "Alex Smith" },
  { id: "alex-j", name: "Alex Jones" },
  { id: "grandpa", name: "Grandpa Bill" },
];

function baseIntent(partial: Partial<AssistantIntent>): AssistantIntent {
  return {
    action: "create_movie",
    people: [],
    raw_prompt: partial.raw_prompt ?? "test",
    ...partial,
  };
}

describe("resolvePeopleNames", () => {
  it("matches unique first name to full person name", () => {
    const result = resolvePeopleNames(["Noah"], catalog);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.id).toBe("noah");
    expect(result.unresolved).toHaveLength(0);
  });

  it("returns ambiguous candidates instead of guessing", () => {
    const result = resolvePeopleNames(["Alex"], catalog);
    expect(result.matched).toHaveLength(0);
    expect(result.unresolved[0]?.reason).toBe("ambiguous");
    expect(result.unresolved[0]?.candidates.map((c) => c.id).sort()).toEqual([
      "alex-j",
      "alex-s",
    ]);
  });

  it("marks unknown names as not_found", () => {
    const result = resolvePeopleNames(["Zelda"], catalog);
    expect(result.unresolved[0]?.reason).toBe("not_found");
  });

  it("allows a single-edit typo on longer first names", () => {
    const result = resolvePeopleNames(["Noarh"], catalog);
    expect(result.matched[0]?.id).toBe("noah");
  });
});

describe("resolveDateReference", () => {
  const now = new Date("2026-07-27T12:00:00Z");

  it("resolves last summer", () => {
    const filter = resolveDateReference(
      { label: "last summer" },
      { now },
    );
    expect(filter?.isConcrete).toBe(true);
    expect(filter?.start).toBe("2025-06-01");
    expect(filter?.end).toBe("2025-08-31");
  });

  it("resolves a calendar year", () => {
    const filter = resolveDateReference({ label: "2022" }, { now });
    expect(filter).toMatchObject({
      start: "2022-01-01",
      end: "2022-12-31",
      isConcrete: true,
    });
  });

  it("resolves Christmas 2024", () => {
    const filter = resolveDateReference(
      { label: "Christmas 2024" },
      { now },
    );
    expect(filter).toMatchObject({
      start: "2024-12-01",
      end: "2024-12-31",
      isConcrete: true,
    });
  });

  it("keeps 7th grade non-concrete without birth year", () => {
    const filter = resolveDateReference(
      { label: "7th grade" },
      {
        now,
        matchedPeople: [
          { id: "noah", name: "Noah Roberts", matchedOn: "Noah", score: 1 },
        ],
      },
    );
    expect(filter?.isConcrete).toBe(false);
    expect(filter?.label).toBe("7th grade");
    expect(filter?.resolutionNote).toMatch(/birth year/i);
  });

  it("maps 7th grade using birth year when provided", () => {
    const filter = resolveDateReference(
      { label: "7th grade" },
      {
        now,
        matchedPeople: [
          { id: "noah", name: "Noah Roberts", matchedOn: "Noah", score: 1 },
        ],
        birthYearByPersonId: { noah: 2010 },
        kindergartenStartAge: 5,
      },
    );
    // 2010 + 5 + 7 = 2022 school year → Aug 2022–Jun 2023
    expect(filter?.isConcrete).toBe(true);
    expect(filter?.start).toBe("2022-08-01");
    expect(filter?.end).toBe("2023-06-30");
  });

  it("prefers explicit ISO bounds from the parser", () => {
    const filter = resolveDateReference(
      { label: "custom", start: "2021-03-01", end: "2021-03-31" },
      { now },
    );
    expect(filter?.isConcrete).toBe(true);
    expect(filter?.start).toBe("2021-03-01");
  });
});

describe("resolveIntentWithCatalog", () => {
  it("resolves slideshow-style intent for Noah + grade", () => {
    const resolved = resolveIntentWithCatalog(
      baseIntent({
        people: ["Noah"],
        date_range: { label: "7th grade" },
        raw_prompt: "Create a slideshow of Noah images from 7th grade",
      }),
      catalog,
      { now: new Date("2026-07-27T12:00:00Z") },
    );

    expect(resolved.peopleIds).toEqual(["noah"]);
    expect(resolved.unresolvedPeople).toHaveLength(0);
    expect(resolved.dateFilter?.label).toBe("7th grade");
    expect(resolved.dateFilter?.isConcrete).toBe(false);
    expect(resolved.needsClarification).toBe(true);
    expect(resolved.clarifyingQuestions.some((q) => /grade/i.test(q))).toBe(
      true,
    );
  });

  it("resolves Grandpa without inventing people", () => {
    const resolved = resolveIntentWithCatalog(
      baseIntent({
        action: "search_media",
        people: ["Grandpa"],
        qualities: ["fishing"],
        raw_prompt: "Show me photos of Grandpa fishing",
      }),
      catalog,
    );
    expect(resolved.peopleIds).toEqual(["grandpa"]);
    expect(resolved.needsClarification).toBe(false);
  });

  it("asks for clarification on ambiguous Alex", () => {
    const resolved = resolveIntentWithCatalog(
      baseIntent({
        people: ["Alex"],
        raw_prompt: "Photos of Alex",
        action: "search_media",
      }),
      catalog,
    );
    expect(resolved.peopleIds).toEqual([]);
    expect(resolved.needsClarification).toBe(true);
    expect(resolved.unresolvedPeople[0]?.reason).toBe("ambiguous");
  });
});
