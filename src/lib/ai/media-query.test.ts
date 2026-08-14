import { describe, expect, it } from "vitest";
import {
  endOfUtcDay,
  explainSparseMediaResults,
  scrubPersonNameHint,
  scrubPersonNameHints,
  startOfUtcDay,
  type MediaQueryDiagnostics,
} from "@/lib/ai/media-query";
import { assessVisualLabelCoverage } from "@/lib/ai/visual-coverage";

function diagnostics(
  partial: Partial<MediaQueryDiagnostics>,
): MediaQueryDiagnostics {
  const cleanReadyTotal = partial.cleanReadyTotal ?? 10;
  const visualLabeledTotal = partial.visualLabeledTotal ?? 10;
  const visualUnlabeledTotal =
    partial.visualUnlabeledTotal ??
    Math.max(0, cleanReadyTotal - visualLabeledTotal);
  const coverage = assessVisualLabelCoverage({
    cleanReadyTotal,
    visualLabeledTotal,
    visualUnlabeledTotal,
  });
  return {
    matchedCount: 0,
    withPeopleOnly: null,
    withDateOnly: null,
    peopleWithoutFaces: [],
    dateFilterApplied: false,
    dateFilterConcrete: false,
    textHintsApplied: false,
    peopleMatch: "any",
    peopleIdCount: 0,
    searchMode: "browse",
    ...partial,
    cleanReadyTotal,
    visualLabeledTotal,
    visualUnlabeledTotal,
    lowVisualCoverage: partial.lowVisualCoverage ?? coverage.lowCoverage,
    visualLabeledRatio: partial.visualLabeledRatio ?? coverage.labeledRatio,
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

  it("mentions visual analysis when labels are sparse for object search", () => {
    const explanation = explainSparseMediaResults({
      diagnostics: diagnostics({
        matchedCount: 0,
        cleanReadyTotal: 20,
        visualLabeledTotal: 2,
        visualUnlabeledTotal: 18,
        textHintsApplied: true,
        searchMode: "visual_labels",
      }),
      visualQuery: "toilet",
      intentKind: "object_search",
    });
    expect(explanation.empty).toBe(true);
    expect(explanation.lowVisualCoverage).toBe(true);
    expect(explanation.summary).toMatch(
      /couldn’t find photos of a toilet in your library yet/i,
    );
    expect(
      explanation.suggestions.some((s) => /still need visual analysis/i.test(s)),
    ).toBe(true);
    expect(
      explanation.suggestions.some((s) => /upload more photos/i.test(s)),
    ).toBe(true);
    expect(explanation.suggestions.some((s) => /related terms/i.test(s))).toBe(
      true,
    );
    expect(
      explanation.reasons.some((r) => /anyone named/i.test(r)) ||
        explanation.suggestions.some((s) => /anyone named/i.test(s)) ||
        /anyone named/i.test(explanation.summary),
    ).toBe(false);
  });

  it("detects low analysis coverage with many clean photos and few labels", () => {
    const explanation = explainSparseMediaResults({
      diagnostics: diagnostics({
        matchedCount: 0,
        cleanReadyTotal: 40,
        visualLabeledTotal: 3,
        visualUnlabeledTotal: 37,
        textHintsApplied: true,
        searchMode: "visual_labels",
      }),
      visualQuery: "beach",
      intentKind: "scene_search",
      includeAdminHint: true,
    });
    expect(explanation.lowVisualCoverage).toBe(true);
    expect(
      explanation.suggestions.some((s) =>
        /Only 3 of 40 clean photos have object\/scene labels/i.test(s),
      ),
    ).toBe(true);
    expect(
      explanation.suggestions.some((s) =>
        /enqueue-scene-analysis|reanalyze-vision/i.test(s),
      ),
    ).toBe(true);
    expect(explanation.summary).not.toMatch(/People|anyone named/i);
  });

  it("never uses person fallback for object queries even if people diagnostics exist", () => {
    const explanation = explainSparseMediaResults({
      diagnostics: diagnostics({
        matchedCount: 0,
        cleanReadyTotal: 40,
        peopleIdCount: 1,
        withPeopleOnly: 0,
        peopleWithoutFaces: [{ id: "scott", name: "Scott" }],
        textHintsApplied: true,
        searchMode: "visual_labels",
      }),
      visualQuery: "toilet",
      intentKind: "object_search",
      matchedPeople: [
        { id: "scott", name: "Scott", matchedOn: "Scott", score: 1 },
      ],
    });
    expect(explanation.summary).toMatch(/photos of a toilet/i);
    expect(explanation.summary).not.toMatch(/Scott|anyone named|People/i);
    expect(
      explanation.suggestions.some((s) => /assign faces|People list/i.test(s)),
    ).toBe(false);
  });

  it("uses person empty copy for person_search misses", () => {
    const explanation = explainSparseMediaResults({
      diagnostics: diagnostics({
        matchedCount: 0,
        cleanReadyTotal: 40,
        peopleIdCount: 0,
      }),
      intentKind: "person_search",
      peopleNames: ["Scott"],
      unresolvedPeople: [
        { query: "Scott", reason: "not_found", candidates: [] },
      ],
    });
    expect(explanation.summary).toBe(
      "I couldn’t find anyone named Scott in People.",
    );
    expect(explanation.suggestions.some((s) => /Check People/i.test(s))).toBe(
      true,
    );
    expect(explanation.suggestions.some((s) => /assign faces/i.test(s))).toBe(
      true,
    );
  });
});

describe("scrubPersonNameHints", () => {
  it("drops hints that are only the resolved person name", () => {
    expect(scrubPersonNameHint("Craig Hale", ["Craig Hale"])).toBe("");
    expect(scrubPersonNameHint("Craig", ["Craig Hale"])).toBe("");
    expect(
      scrubPersonNameHints(["Craig Hale", "fishing"], ["Craig Hale"]),
    ).toEqual(["fishing"]);
  });

  it("keeps real visual terms for mixed people+activity asks", () => {
    expect(scrubPersonNameHints(["fishing"], ["Grandpa"])).toEqual(["fishing"]);
  });
});
