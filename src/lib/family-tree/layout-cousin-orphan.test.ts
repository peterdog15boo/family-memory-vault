import { describe, expect, it } from "vitest";
import { computeFamilyTreeLayout, TREE_LAYOUT } from "@/lib/family-tree/layout";
import { assignGenerationRanks } from "@/lib/family-tree/types";

/**
 * Repro: cousin with no parents used to stay on generation 0 and pack into
 * the empty space on the spouse’s parent row (Jeff’s side).
 */
describe("cousin without parents same generation", () => {
  it("keeps cousin on peer generation and Kathy side", () => {
    const nodes = [
      { id: "diane", label: "Diane" },
      { id: "frank", label: "Frank" },
      { id: "paul", label: "Paul" },
      { id: "helene", label: "Helene" },
      { id: "jeff", label: "Jeff" },
      { id: "kathy", label: "Kathy" },
      { id: "donna", label: "Donna" },
      { id: "scott", label: "Scott" },
    ];
    const edges = [
      { fromNodeId: "diane", toNodeId: "frank", type: "partner_of" as const },
      { fromNodeId: "diane", toNodeId: "kathy", type: "parent_of" as const },
      { fromNodeId: "frank", toNodeId: "kathy", type: "parent_of" as const },
      { fromNodeId: "diane", toNodeId: "donna", type: "parent_of" as const },
      { fromNodeId: "frank", toNodeId: "donna", type: "parent_of" as const },
      { fromNodeId: "paul", toNodeId: "helene", type: "partner_of" as const },
      { fromNodeId: "paul", toNodeId: "jeff", type: "parent_of" as const },
      { fromNodeId: "helene", toNodeId: "jeff", type: "parent_of" as const },
      { fromNodeId: "jeff", toNodeId: "kathy", type: "partner_of" as const },
      { fromNodeId: "kathy", toNodeId: "donna", type: "sibling_of" as const },
      { fromNodeId: "kathy", toNodeId: "scott", type: "cousin_of" as const },
    ];

    const ranks = assignGenerationRanks(
      nodes.map((n) => n.id),
      edges
        .filter((e) => e.type === "parent_of")
        .map((e) => ({
          fromNodeId: e.fromNodeId,
          toNodeId: e.toNodeId,
        })),
      {
        partnerPairs: edges
          .filter((e) => e.type === "partner_of")
          .map((e) => [e.fromNodeId, e.toNodeId] as const),
        siblingPairs: edges
          .filter((e) => e.type === "sibling_of")
          .map((e) => [e.fromNodeId, e.toNodeId] as const),
        cousinPairs: edges
          .filter((e) => e.type === "cousin_of")
          .map((e) => [e.fromNodeId, e.toNodeId] as const),
      },
    );
    expect(ranks.scott).toBe(ranks.kathy);

    const layout = computeFamilyTreeLayout(nodes, edges);
    const by = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
    expect(by.scott!.generation).toBe(by.kathy!.generation);
    expect(by.scott!.y).toBe(by.kathy!.y);

    const mid = (id: string) => by[id]!.x + TREE_LAYOUT.nodeWidth / 2;
    expect(Math.abs(mid("scott") - mid("kathy"))).toBeLessThan(
      Math.abs(mid("scott") - mid("jeff")),
    );

    const kathyLeft = by.kathy!.x < by.jeff!.x;
    if (kathyLeft) {
      expect(by.scott!.x).toBeLessThan(by.kathy!.x);
    } else {
      expect(by.scott!.x).toBeGreaterThan(by.kathy!.x);
    }
  });
});
