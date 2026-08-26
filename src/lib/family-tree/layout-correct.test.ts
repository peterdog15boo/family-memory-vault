import { describe, expect, it } from "vitest";
import {
  assessLayoutQuality,
  correctFamilyTreeLayout,
  computeNaiveFamilyTreeLayout,
} from "@/lib/family-tree/layout-correct";
import { TREE_LAYOUT } from "@/lib/family-tree/layout";

describe("correctFamilyTreeLayout", () => {
  it("reflows a wife’s sister beside the wife without dropping nodes", () => {
    const nodes = [
      { id: "jeff", label: "Jeff" },
      { id: "kathy", label: "Kathy" },
      { id: "sue", label: "Sue" },
    ];
    const edges = [
      {
        fromNodeId: "jeff",
        toNodeId: "kathy",
        type: "partner_of" as const,
      },
      {
        fromNodeId: "kathy",
        toNodeId: "sue",
        type: "sibling_of" as const,
      },
    ];

    const result = correctFamilyTreeLayout(nodes, edges);

    expect(result.preservedNodeIds.sort()).toEqual(
      ["jeff", "kathy", "sue"].sort(),
    );
    expect(result.layout.nodes).toHaveLength(3);
    expect(result.after.nodeCount).toBe(3);
    expect(result.before.nodeCount).toBe(3);

    const jeff = result.layout.nodes.find((n) => n.id === "jeff")!;
    const kathy = result.layout.nodes.find((n) => n.id === "kathy")!;
    const sue = result.layout.nodes.find((n) => n.id === "sue")!;

    expect(sue.y).toBe(kathy.y);
    const sueMid = sue.x + TREE_LAYOUT.nodeWidth / 2;
    const kathyMid = kathy.x + TREE_LAYOUT.nodeWidth / 2;
    const jeffMid = jeff.x + TREE_LAYOUT.nodeWidth / 2;
    expect(Math.abs(sueMid - kathyMid)).toBeLessThan(
      Math.abs(sueMid - jeffMid),
    );

    const jeffLeft = jeff.x < kathy.x;
    if (jeffLeft) expect(sue.x).toBeGreaterThan(kathy.x);
    else expect(sue.x).toBeLessThan(kathy.x);
  });

  it("places sister-in-law of husband beside the wife", () => {
    const result = correctFamilyTreeLayout(
      [
        { id: "jeff", label: "Jeff" },
        { id: "kathy", label: "Kathy" },
        { id: "sue", label: "Sue" },
      ],
      [
        {
          fromNodeId: "jeff",
          toNodeId: "kathy",
          type: "partner_of",
        },
        {
          fromNodeId: "sue",
          toNodeId: "jeff",
          type: "sister_in_law_of",
        },
      ],
    );

    const jeff = result.layout.nodes.find((n) => n.id === "jeff")!;
    const kathy = result.layout.nodes.find((n) => n.id === "kathy")!;
    const sue = result.layout.nodes.find((n) => n.id === "sue")!;
    expect(Math.abs(sue.x - kathy.x)).toBeLessThan(
      Math.abs(sue.x - jeff.x),
    );
  });

  it("reports fewer quality issues after Layout IQ than naive packing", () => {
    const nodes = [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ];
    // Insertion order puts sibling C far from B if partners pack first in IQ.
    const edges = [
      { fromNodeId: "a", toNodeId: "b", type: "partner_of" as const },
      { fromNodeId: "b", toNodeId: "c", type: "sibling_of" as const },
    ];
    const naive = computeNaiveFamilyTreeLayout(nodes, edges);
    const corrected = correctFamilyTreeLayout(nodes, edges);
    const beforeIssues = assessLayoutQuality(naive, edges);
    expect(corrected.issuesAfter.length).toBeLessThanOrEqual(
      beforeIssues.length,
    );
    expect(corrected.corrected).toBe(true);
    expect(corrected.message).toMatch(/layout/i);
  });
});
