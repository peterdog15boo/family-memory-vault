import { describe, expect, it } from "vitest";
import {
  LEGACY_PLANNING_CATEGORIES,
  LEGACY_PLANNING_CATEGORY_IDS,
  LEGACY_PLANNING_DOC_BONUS_RATIO,
  assertPlanningWeights,
} from "@/lib/legacy/planning-categories";
import {
  computePlanningScore,
  isPlanningItemFilled,
} from "@/lib/legacy/planning-score";

describe("legacy planning catalog", () => {
  it("keeps nine weighted categories that sum to 100", () => {
    expect(LEGACY_PLANNING_CATEGORY_IDS).toEqual([
      "banking",
      "credit",
      "insurance",
      "investments",
      "legal_docs",
      "contacts",
      "digital_assets",
      "property",
      "final_wishes",
    ]);
    expect(LEGACY_PLANNING_CATEGORIES).toHaveLength(9);
    expect(() => assertPlanningWeights()).not.toThrow();
    expect(
      LEGACY_PLANNING_CATEGORIES.reduce((sum, c) => sum + c.weight, 0),
    ).toBe(100);
  });
});

describe("isPlanningItemFilled", () => {
  it("requires a title plus one supporting field", () => {
    expect(isPlanningItemFilled({ title: "Checking" })).toBe(false);
    expect(
      isPlanningItemFilled({ title: "Checking", institution: "First National" }),
    ).toBe(true);
    expect(
      isPlanningItemFilled({ title: "Will", locationHint: "Safe deposit box" }),
    ).toBe(true);
  });
});

describe("computePlanningScore", () => {
  it("scores completeness from weights and strength with document bonus", () => {
    const empty = computePlanningScore([]);
    expect(empty.completenessPercent).toBe(0);
    expect(empty.strengthPercent).toBe(0);
    expect(empty.nextCategoryId).toBe("banking");

    const banking = LEGACY_PLANNING_CATEGORIES.find((c) => c.id === "banking")!;
    const filledBanking = computePlanningScore([
      { categoryId: "banking", hasFilledItem: true, hasDocuments: false },
    ]);
    expect(filledBanking.completenessPercent).toBe(banking.weight);
    expect(filledBanking.completedCategoryIds).toEqual(["banking"]);
    expect(filledBanking.nextCategoryId).toBe("credit");

    const withDocs = computePlanningScore([
      { categoryId: "banking", hasFilledItem: true, hasDocuments: true },
    ]);
    const bonus = Math.round(banking.weight * LEGACY_PLANNING_DOC_BONUS_RATIO);
    expect(withDocs.earnedPoints).toBe(banking.weight + bonus);
    expect(withDocs.strengthPercent).toBeGreaterThan(filledBanking.strengthPercent);
    expect(withDocs.documentationPercent).toBe(
      Math.round(100 / LEGACY_PLANNING_CATEGORIES.length),
    );
  });

  it("reaches 100% completeness when every category is filled", () => {
    const allFilled = computePlanningScore(
      LEGACY_PLANNING_CATEGORY_IDS.map((categoryId) => ({
        categoryId,
        hasFilledItem: true,
        hasDocuments: false,
      })),
    );
    expect(allFilled.completenessPercent).toBe(100);
    expect(allFilled.strengthPercent).toBeLessThan(100);
    expect(allFilled.nextCategoryId).toBe("banking");

    const allDocumented = computePlanningScore(
      LEGACY_PLANNING_CATEGORY_IDS.map((categoryId) => ({
        categoryId,
        hasFilledItem: true,
        hasDocuments: true,
      })),
    );
    expect(allDocumented.completenessPercent).toBe(100);
    expect(allDocumented.strengthPercent).toBe(100);
    expect(allDocumented.documentationPercent).toBe(100);
    expect(allDocumented.nextCategoryId).toBeNull();
  });
});
