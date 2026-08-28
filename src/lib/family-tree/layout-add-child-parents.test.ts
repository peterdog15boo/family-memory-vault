import { describe, expect, it } from "vitest";
import { computeFamilyTreeLayout, TREE_LAYOUT } from "@/lib/family-tree/layout";
import { showsStepChildHint } from "@/lib/family-tree/genealogy-iq";

/**
 * Add child from a person who has a spouse:
 * - Spouse unchecked → child under A only; spouse docks with no drop
 * - Spouse checked → child under couple midpoint
 */
describe("addChild parent picker layout", () => {
  it("Danielle+Rob with Rob unchecked: child under Danielle only", () => {
    const layout = computeFamilyTreeLayout(
      [
        { id: "danielle", label: "Danielle" },
        { id: "rob", label: "Rob" },
        { id: "kid", label: "Kid" },
      ],
      [
        {
          id: "e-p",
          fromNodeId: "danielle",
          toNodeId: "rob",
          type: "partner_of",
        },
        {
          id: "e-d",
          fromNodeId: "danielle",
          toNodeId: "kid",
          type: "parent_of",
        },
      ],
    );
    const by = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));

    expect(by.danielle!.y).toBe(by.rob!.y);
    expect(by.kid!.y).toBeGreaterThan(by.danielle!.y);
    expect(Math.abs(by.danielle!.x - by.rob!.x)).toBeLessThanOrEqual(
      TREE_LAYOUT.nodeWidth + TREE_LAYOUT.partnerGap + 1,
    );

    const danielleMid = by.danielle!.x + TREE_LAYOUT.nodeWidth / 2;
    const kidMid = by.kid!.x + TREE_LAYOUT.nodeWidth / 2;
    const coupleMid =
      (Math.min(by.danielle!.x, by.rob!.x) +
        Math.max(by.danielle!.x, by.rob!.x) +
        TREE_LAYOUT.nodeWidth) /
      2;

    expect(Math.abs(kidMid - danielleMid)).toBeLessThan(
      TREE_LAYOUT.nodeWidth * 0.35,
    );
    expect(Math.abs(kidMid - coupleMid)).toBeGreaterThan(
      TREE_LAYOUT.nodeWidth * 0.15,
    );

    const parentEdges = layout.edges.filter((e) => e.type === "parent_of");
    expect(parentEdges).toHaveLength(1);
    expect(parentEdges[0]!.fromId).toBe("danielle");
    expect(parentEdges[0]!.path).not.toContain(`L ${coupleMid} `);

    expect(
      showsStepChildHint(
        [
          { fromNodeId: "danielle", toNodeId: "rob", type: "partner_of" },
          { fromNodeId: "danielle", toNodeId: "kid", type: "parent_of" },
        ],
        "kid",
      ),
    ).toBe(true);
  });

  it("Pam+Craig with Craig checked: child centered under the couple", () => {
    const layout = computeFamilyTreeLayout(
      [
        { id: "pam", label: "Pam" },
        { id: "craig", label: "Craig" },
        { id: "kid", label: "Kid" },
      ],
      [
        {
          id: "e-p",
          fromNodeId: "pam",
          toNodeId: "craig",
          type: "partner_of",
        },
        {
          id: "e-pam",
          fromNodeId: "pam",
          toNodeId: "kid",
          type: "parent_of",
        },
        {
          id: "e-craig",
          fromNodeId: "craig",
          toNodeId: "kid",
          type: "parent_of",
        },
      ],
    );
    const by = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
    const coupleMid =
      (Math.min(by.pam!.x, by.craig!.x) +
        Math.max(by.pam!.x, by.craig!.x) +
        TREE_LAYOUT.nodeWidth) /
      2;
    const kidMid = by.kid!.x + TREE_LAYOUT.nodeWidth / 2;

    expect(Math.abs(kidMid - coupleMid)).toBeLessThan(
      TREE_LAYOUT.nodeWidth * 0.35,
    );

    const parentEdges = layout.edges.filter((e) => e.type === "parent_of");
    expect(parentEdges).toHaveLength(2);
    for (const e of parentEdges) {
      expect(e.path).toContain(`L ${coupleMid} `);
    }

    expect(
      showsStepChildHint(
        [
          { fromNodeId: "pam", toNodeId: "craig", type: "partner_of" },
          { fromNodeId: "pam", toNodeId: "kid", type: "parent_of" },
          { fromNodeId: "craig", toNodeId: "kid", type: "parent_of" },
        ],
        "kid",
      ),
    ).toBe(false);
  });
});
