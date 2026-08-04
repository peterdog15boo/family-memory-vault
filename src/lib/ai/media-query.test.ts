import { describe, expect, it } from "vitest";
import {
  endOfUtcDay,
  explainSparseMediaResults,
  startOfUtcDay,
  type MediaQueryDiagnostics,
} from "@/lib/ai/media-query";

function diagnostics(
  partial: Partial<MediaQueryDiagnostics>,
): MediaQueryDiagnostics {
  return {
    matchedCount: 0,
    cleanReadyTotal: 10,
    withPeopleOnly: null,
    withDateOnly: null,
    peopleWithoutFaces: [],
    dateFilterApplied: false,
    dateFilterConcrete: false,
    textHintsApplied: false,
    peopleMatch: "any",
    peopleIdCount: 0,
    ...partial,
  };
}

describe("date bounds", () => {
  it("builds inclusive UTC day bounds", () => {
    expect(startOfUtcDay("2022-01-01")?.toISOString()).toBe(
      "2022-01-01T00:00:00.000Z",
    );
    expect(endOfUtcDay("2022-01-01")?.toISOString()).toBe(
      "2022-01-01T23:59:59.999Z",
    );
    expect(startOfUtcDay("not-a-date")).toBeNull();
  });
});

describe("explainSparseMediaResults", () => {
  it("explains empty library", () => {
    const explanation = explainSparseMediaResults({
      diagnostics: diagnostics({ cleanReadyTotal: 0, matchedCount: 0 }),
    });
    expect(explanation.empty).toBe(true);
    expect(explanation.reasons[0]).toMatch(/no clean, ready photos/i);
    expect(explanation.suggestions.length).toBeGreaterThan(0);
  });

  it("explains people with no face tags", () => {
    const explanation = explainSparseMediaResults({
      diagnostics: diagnostics({
        matchedCount: 0,
        peopleIdCount: 1,
        withPeopleOnly: 0,
        peopleWithoutFaces: [{ id: "noah", name: "Noah Roberts" }],
      }),
      matchedPeople: [
        { id: "noah", name: "Noah Roberts", matchedOn: "Noah", score: 1 },
      ],
    });
    expect(explanation.reasons.some((r) => /tagged faces/i.test(r))).toBe(true);
    expect(explanation.suggestions.some((s) => /People/i.test(s))).toBe(true);
  });

  it("explains date miss when people photos exist", () => {
    const explanation = explainSparseMediaResults({
      diagnostics: diagnostics({
        matchedCount: 0,
        peopleIdCount: 1,
        withPeopleOnly: 12,
        withDateOnly: 0,
        dateFilterApplied: true,
        dateFilterConcrete: true,
        dateLabel: "2022",
      }),
      matchedPeople: [
        { id: "noah", name: "Noah Roberts", matchedOn: "Noah", score: 1 },
      ],
    });
    expect(explanation.summary).toMatch(/couldn’t find|could not find|no/i);
    expect(explanation.reasons.some((r) => /2022/.test(r))).toBe(true);
    expect(explanation.suggestions.some((s) => /Widen|drop the time/i.test(s))).toBe(
      true,
    );
  });

  it("explains non-concrete grade-style dates", () => {
    const explanation = explainSparseMediaResults({
      diagnostics: diagnostics({
        matchedCount: 0,
        dateFilterApplied: true,
        dateFilterConcrete: false,
        dateLabel: "7th grade",
        peopleIdCount: 1,
        withPeopleOnly: 20,
      }),
    });
    expect(explanation.reasons.some((r) => /7th grade/.test(r))).toBe(true);
    expect(explanation.suggestions.some((s) => /year/i.test(s))).toBe(true);
  });

  it("flags sparse non-empty results", () => {
    const explanation = explainSparseMediaResults({
      diagnostics: diagnostics({ matchedCount: 2, cleanReadyTotal: 50 }),
      sparseThreshold: 3,
    });
    expect(explanation.sparse).toBe(true);
    expect(explanation.empty).toBe(false);
    expect(explanation.summary).toMatch(/only found 2/i);
  });
});
