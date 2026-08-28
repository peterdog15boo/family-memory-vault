import { describe, expect, it } from "vitest";
import { computeFamilyTreeLayout, TREE_LAYOUT } from "@/lib/family-tree/layout";

/**
 * Multi-child unions must center the sibling block on the couple midpoint —
 * not park the first child on the mid and grow right off the right spouse.
 */
describe("center children under parent couple", () => {
  it("centers Pam+Craig’s three kids under the couple, not trailing off Craig", () => {
    const nodes = [
      { id: "paul", label: "Paul" },
      { id: "helene", label: "Helene" },
      { id: "kathy", label: "Kathy" },
      { id: "jeff", label: "Jeff" },
      { id: "diane", label: "Diane" },
      { id: "frank", label: "Frank" },
      { id: "pam", label: "Pam" },
      { id: "craig", label: "Craig" },
      { id: "michael", label: "Michael" },
      { id: "david", label: "David" },
      { id: "elizabeth", label: "Elizabeth" },
    ];
    const edges = [
      { fromNodeId: "diane", toNodeId: "frank", type: "partner_of" as const },
      { fromNodeId: "diane", toNodeId: "kathy", type: "parent_of" as const },
      { fromNodeId: "frank", toNodeId: "kathy", type: "parent_of" as const },
      { fromNodeId: "paul", toNodeId: "helene", type: "partner_of" as const },
      { fromNodeId: "paul", toNodeId: "jeff", type: "parent_of" as const },
      { fromNodeId: "helene", toNodeId: "jeff", type: "parent_of" as const },
      { fromNodeId: "paul", toNodeId: "pam", type: "parent_of" as const },
      { fromNodeId: "helene", toNodeId: "pam", type: "parent_of" as const },
      { fromNodeId: "kathy", toNodeId: "jeff", type: "partner_of" as const },
      { fromNodeId: "jeff", toNodeId: "pam", type: "sibling_of" as const },
      { fromNodeId: "pam", toNodeId: "craig", type: "partner_of" as const },
      // Do not change Pam/Craig parent_of edges — kids only.
      { fromNodeId: "pam", toNodeId: "michael", type: "parent_of" as const },
      { fromNodeId: "craig", toNodeId: "michael", type: "parent_of" as const },
      { fromNodeId: "pam", toNodeId: "david", type: "parent_of" as const },
      { fromNodeId: "craig", toNodeId: "david", type: "parent_of" as const },
      { fromNodeId: "pam", toNodeId: "elizabeth", type: "parent_of" as const },
      {
        fromNodeId: "craig",
        toNodeId: "elizabeth",
        type: "parent_of" as const,
      },
    ];

    const layout = computeFamilyTreeLayout(nodes, edges);
    const by = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
    const mid = (id: string) => by[id]!.x + TREE_LAYOUT.nodeWidth / 2;
    const coupleMid =
      (Math.min(by.pam!.x, by.craig!.x) +
        Math.max(by.pam!.x, by.craig!.x) +
        TREE_LAYOUT.nodeWidth) /
      2;

    expect(by.michael!.y).toBe(by.david!.y);
    expect(by.elizabeth!.y).toBe(by.david!.y);
    expect(by.michael!.y).toBeGreaterThan(by.pam!.y);

    const kidsLeft = Math.min(by.michael!.x, by.david!.x, by.elizabeth!.x);
    const kidsRight =
      Math.max(by.michael!.x, by.david!.x, by.elizabeth!.x) +
      TREE_LAYOUT.nodeWidth;
    const kidsBlockMid = (kidsLeft + kidsRight) / 2;
    expect(Math.abs(kidsBlockMid - coupleMid)).toBeLessThan(
      TREE_LAYOUT.nodeWidth * 0.35,
    );

    // Not the old “first kid on mid, rest trailing right of Craig” pattern.
    const craigRight = Math.max(by.pam!.x, by.craig!.x) + TREE_LAYOUT.nodeWidth;
    expect(kidsRight).toBeLessThan(craigRight + TREE_LAYOUT.nodeWidth * 2.5);
    expect(kidsLeft).toBeLessThan(coupleMid);
    expect(kidsRight).toBeGreaterThan(coupleMid);

    // Order stays left→right as laid out (stable sibling packing).
    const ordered = [by.michael!, by.david!, by.elizabeth!].sort(
      (a, b) => a.x - b.x,
    );
    expect(ordered).toHaveLength(3);
    expect(ordered[1]!.x).toBeGreaterThan(ordered[0]!.x);
    expect(ordered[2]!.x).toBeGreaterThan(ordered[1]!.x);

    // Spouses stay a tight pair above.
    expect(
      Math.abs(by.pam!.x - by.craig!.x),
    ).toBeLessThanOrEqual(TREE_LAYOUT.nodeWidth + TREE_LAYOUT.partnerGap + 1);
    void mid;
  });

  it("centers a single child under the couple midpoint", () => {
    const layout = computeFamilyTreeLayout(
      [
        { id: "mom", label: "Mom" },
        { id: "dad", label: "Dad" },
        { id: "kid", label: "Kid" },
      ],
      [
        { fromNodeId: "dad", toNodeId: "mom", type: "partner_of" },
        { fromNodeId: "mom", toNodeId: "kid", type: "parent_of" },
        { fromNodeId: "dad", toNodeId: "kid", type: "parent_of" },
      ],
    );
    const by = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
    const coupleMid =
      (Math.min(by.mom!.x, by.dad!.x) +
        Math.max(by.mom!.x, by.dad!.x) +
        TREE_LAYOUT.nodeWidth) /
      2;
    const kidMid = by.kid!.x + TREE_LAYOUT.nodeWidth / 2;
    expect(Math.abs(kidMid - coupleMid)).toBeLessThan(
      TREE_LAYOUT.nodeWidth * 0.35,
    );
  });
});
