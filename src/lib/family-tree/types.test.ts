import { describe, expect, it } from "vitest";
import {
  assignGenerationRanks,
  canonicalizeRelationshipEndpoints,
  deriveFamilyTreeEdges,
  isFamilyTreeRelationType,
} from "@/lib/family-tree/types";

describe("canonicalizeRelationshipEndpoints", () => {
  it("keeps parent_of directional", () => {
    expect(
      canonicalizeRelationshipEndpoints("parent_of", "parent", "child"),
    ).toEqual({ fromNodeId: "parent", toNodeId: "child" });
  });

  it("orders undirected partner/sibling/cousin pairs", () => {
    expect(
      canonicalizeRelationshipEndpoints("partner_of", "z", "a"),
    ).toEqual({ fromNodeId: "a", toNodeId: "z" });
    expect(
      canonicalizeRelationshipEndpoints("sibling_of", "b", "a"),
    ).toEqual({ fromNodeId: "a", toNodeId: "b" });
    expect(
      canonicalizeRelationshipEndpoints("cousin_of", "m", "k"),
    ).toEqual({ fromNodeId: "k", toNodeId: "m" });
  });

  it("keeps niece/nephew directional", () => {
    expect(
      canonicalizeRelationshipEndpoints("niece_of", "niece", "aunt"),
    ).toEqual({ fromNodeId: "niece", toNodeId: "aunt" });
  });
});

describe("deriveFamilyTreeEdges", () => {
  it("derives grandparents and siblings from parent links", () => {
    const derived = deriveFamilyTreeEdges([
      { fromNodeId: "gp", toNodeId: "p" },
      { fromNodeId: "p", toNodeId: "c1" },
      { fromNodeId: "p", toNodeId: "c2" },
    ]);

    expect(derived).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "grandparent_of",
          fromNodeId: "gp",
          toNodeId: "c1",
        }),
        expect.objectContaining({
          type: "grandchild_of",
          fromNodeId: "c1",
          toNodeId: "gp",
        }),
        expect.objectContaining({
          type: "sibling_of",
          fromNodeId: "c1",
          toNodeId: "c2",
        }),
      ]),
    );
  });
});

describe("assignGenerationRanks", () => {
  it("ranks roots at 0 and children deeper", () => {
    const ranks = assignGenerationRanks(["gp", "p", "c"], [
      { fromNodeId: "gp", toNodeId: "p" },
      { fromNodeId: "p", toNodeId: "c" },
    ]);
    expect(ranks.gp).toBe(0);
    expect(ranks.p).toBe(1);
    expect(ranks.c).toBe(2);
  });

  it("keeps partners on the same generation", () => {
    const ranks = assignGenerationRanks(
      ["jeff", "kathy", "dad"],
      [{ fromNodeId: "dad", toNodeId: "jeff" }],
      { partnerPairs: [["jeff", "kathy"]] },
    );
    expect(ranks.jeff).toBe(ranks.kathy);
    expect(ranks.dad).toBeLessThan(ranks.jeff);
  });
});

describe("isFamilyTreeRelationType", () => {
  it("accepts stored types only", () => {
    expect(isFamilyTreeRelationType("parent_of")).toBe(true);
    expect(isFamilyTreeRelationType("cousin_of")).toBe(true);
    expect(isFamilyTreeRelationType("other_relative_of")).toBe(true);
    expect(isFamilyTreeRelationType("grandparent_of")).toBe(false);
  });
});
