import { describe, expect, it } from "vitest";
import { computeFamilyTreeLayout, TREE_LAYOUT } from "@/lib/family-tree/layout";

/**
 * Real-world shape: Kathy/Kat’s cousin Scott must sit on Kathy’s flank
 * (with Donna), not in empty space on Jeff’s parent branch — even when the
 * aunt/uncle sibling bridge was wrongly attached to Jeff’s parents.
 */
describe("cousin relational side placement", () => {
  const nodes = [
    { id: "diane", label: "Diane Barbour" },
    { id: "frank", label: "Frank Barbour" },
    { id: "paul", label: "Paul K Roberts" },
    { id: "helene", label: "Helene Roberts" },
    { id: "scott-mom", label: "Aunt" },
    { id: "scott-dad", label: "Uncle" },
    { id: "jeff", label: "Jeff" },
    { id: "kathy", label: "Kathy" },
    { id: "donna", label: "Donna" },
    { id: "scott", label: "Scott" },
  ];

  function assertScottOnKathysSide(
    edges: Parameters<typeof computeFamilyTreeLayout>[1],
  ) {
    const layout = computeFamilyTreeLayout(nodes, edges);
    const by = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
    const mid = (id: string) => by[id]!.x + TREE_LAYOUT.nodeWidth / 2;

    expect(by.scott!.y).toBe(by.kathy!.y);
    expect(by.donna!.y).toBe(by.kathy!.y);

    // Closer to Kathy than to Jeff.
    expect(Math.abs(mid("scott") - mid("kathy"))).toBeLessThan(
      Math.abs(mid("scott") - mid("jeff")),
    );

    // Same outer flank as Donna (Kathy’s side of the couple).
    const kathyLeft = by.kathy!.x < by.jeff!.x;
    if (kathyLeft) {
      expect(by.scott!.x).toBeLessThan(by.kathy!.x);
      expect(by.donna!.x).toBeLessThan(by.kathy!.x);
    } else {
      expect(by.scott!.x).toBeGreaterThan(by.kathy!.x);
      expect(by.donna!.x).toBeGreaterThan(by.kathy!.x);
    }

    // Not parked under Jeff’s parents cluster.
    const jeffParentsMid = (mid("paul") + mid("helene")) / 2;
    const kathyParentsMid = (mid("diane") + mid("frank")) / 2;
    expect(Math.abs(mid("scott") - kathyParentsMid)).toBeLessThan(
      Math.abs(mid("scott") - jeffParentsMid),
    );

    // Aunt/uncle couple should also lean toward Kathy’s parents, not Jeff’s.
    const scottParentsMid = (mid("scott-mom") + mid("scott-dad")) / 2;
    expect(Math.abs(scottParentsMid - kathyParentsMid)).toBeLessThan(
      Math.abs(scottParentsMid - jeffParentsMid),
    );
  }

  const baseEdges = [
    { fromNodeId: "diane", toNodeId: "frank", type: "partner_of" as const },
    { fromNodeId: "diane", toNodeId: "kathy", type: "parent_of" as const },
    { fromNodeId: "frank", toNodeId: "kathy", type: "parent_of" as const },
    { fromNodeId: "diane", toNodeId: "donna", type: "parent_of" as const },
    { fromNodeId: "frank", toNodeId: "donna", type: "parent_of" as const },
    { fromNodeId: "paul", toNodeId: "helene", type: "partner_of" as const },
    { fromNodeId: "paul", toNodeId: "jeff", type: "parent_of" as const },
    { fromNodeId: "helene", toNodeId: "jeff", type: "parent_of" as const },
    {
      fromNodeId: "scott-mom",
      toNodeId: "scott-dad",
      type: "partner_of" as const,
    },
    {
      fromNodeId: "scott-mom",
      toNodeId: "scott",
      type: "parent_of" as const,
    },
    {
      fromNodeId: "scott-dad",
      toNodeId: "scott",
      type: "parent_of" as const,
    },
    { fromNodeId: "jeff", toNodeId: "kathy", type: "partner_of" as const },
    { fromNodeId: "kathy", toNodeId: "donna", type: "sibling_of" as const },
    { fromNodeId: "kathy", toNodeId: "scott", type: "cousin_of" as const },
  ];

  it("places Scott on Kathy’s side when aunt bridge is correct", () => {
    assertScottOnKathysSide([
      ...baseEdges,
      {
        fromNodeId: "diane",
        toNodeId: "scott-mom",
        type: "sibling_of",
      },
    ]);
  });

  it("still places Scott on Kathy’s side when aunt bridge wrongly targets Jeff’s dad", () => {
    assertScottOnKathysSide([
      ...baseEdges,
      {
        fromNodeId: "paul",
        toNodeId: "scott-mom",
        type: "sibling_of",
      },
    ]);
  });
});
