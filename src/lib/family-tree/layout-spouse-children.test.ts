import { describe, expect, it } from "vitest";
import { computeFamilyTreeLayout, TREE_LAYOUT } from "@/lib/family-tree/layout";
import { showsStepChildHint } from "@/lib/family-tree/genealogy-iq";

/**
 * addSpouse(Danielle, Rob) when Danielle already has Nova:
 * - First-family (checked): both parents → Nova under couple midpoint
 * - Remarriage (unchecked): Nova stays under Danielle; Rob has no drop
 */
describe("addSpouse parent with existing child (Danielle+Rob→Nova)", () => {
  const nodes = [
    { id: "danielle", label: "Danielle" },
    { id: "rob", label: "Rob" },
    { id: "nova", label: "Nova" },
  ];

  const firstFamilyEdges = [
    {
      id: "e-partner",
      fromNodeId: "danielle",
      toNodeId: "rob",
      type: "partner_of" as const,
    },
    {
      id: "e-d-n",
      fromNodeId: "danielle",
      toNodeId: "nova",
      type: "parent_of" as const,
    },
    {
      id: "e-r-n",
      fromNodeId: "rob",
      toNodeId: "nova",
      type: "parent_of" as const,
    },
  ];

  const remarriageEdges = [
    {
      id: "e-partner",
      fromNodeId: "danielle",
      toNodeId: "rob",
      type: "partner_of" as const,
    },
    {
      id: "e-d-n",
      fromNodeId: "danielle",
      toNodeId: "nova",
      type: "parent_of" as const,
    },
  ];

  it("first-family: centers Nova under Danielle+Rob midpoint", () => {
    const layout = computeFamilyTreeLayout(nodes, firstFamilyEdges);
    const by = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));

    expect(by.nova!.y).toBeGreaterThan(by.danielle!.y);
    expect(by.danielle!.y).toBe(by.rob!.y);

    const coupleLeft = Math.min(by.danielle!.x, by.rob!.x);
    const coupleRight =
      Math.max(by.danielle!.x, by.rob!.x) + TREE_LAYOUT.nodeWidth;
    const coupleMid = (coupleLeft + coupleRight) / 2;
    const novaMid = by.nova!.x + TREE_LAYOUT.nodeWidth / 2;

    expect(by.nova!.x).toBeGreaterThanOrEqual(coupleLeft - 1);
    expect(by.nova!.x + TREE_LAYOUT.nodeWidth).toBeLessThanOrEqual(
      coupleRight + 1,
    );
    expect(Math.abs(novaMid - coupleMid)).toBeLessThan(
      TREE_LAYOUT.nodeWidth * 0.35,
    );

    expect(Math.abs(by.danielle!.x - by.rob!.x)).toBeLessThanOrEqual(
      TREE_LAYOUT.nodeWidth + TREE_LAYOUT.partnerGap + 1,
    );
  });

  it("first-family: draws parent drops through the couple bar midpoint", () => {
    const layout = computeFamilyTreeLayout(nodes, firstFamilyEdges);
    const by = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
    const coupleMid =
      (Math.min(by.danielle!.x, by.rob!.x) +
        Math.max(by.danielle!.x, by.rob!.x) +
        TREE_LAYOUT.nodeWidth) /
      2;

    const parentEdges = layout.edges.filter((e) => e.type === "parent_of");
    expect(parentEdges).toHaveLength(2);
    for (const e of parentEdges) {
      expect(e.path).toContain(`L ${coupleMid} `);
    }
  });

  it("remarriage: Nova stays under Danielle; Rob has no drop to Nova", () => {
    const layout = computeFamilyTreeLayout(nodes, remarriageEdges);
    const by = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));

    expect(by.danielle!.y).toBe(by.rob!.y);
    expect(by.nova!.y).toBeGreaterThan(by.danielle!.y);

    // Spouse still docks as a tight pair
    expect(Math.abs(by.danielle!.x - by.rob!.x)).toBeLessThanOrEqual(
      TREE_LAYOUT.nodeWidth + TREE_LAYOUT.partnerGap + 1,
    );

    const danielleMid = by.danielle!.x + TREE_LAYOUT.nodeWidth / 2;
    const novaMid = by.nova!.x + TREE_LAYOUT.nodeWidth / 2;
    const coupleMid =
      (Math.min(by.danielle!.x, by.rob!.x) +
        Math.max(by.danielle!.x, by.rob!.x) +
        TREE_LAYOUT.nodeWidth) /
      2;

    // One-parent child sits under A, not the couple midpoint
    expect(Math.abs(novaMid - danielleMid)).toBeLessThan(
      TREE_LAYOUT.nodeWidth * 0.35,
    );
    expect(Math.abs(novaMid - coupleMid)).toBeGreaterThan(
      TREE_LAYOUT.nodeWidth * 0.15,
    );

    const parentEdges = layout.edges.filter((e) => e.type === "parent_of");
    expect(parentEdges).toHaveLength(1);
    expect(parentEdges[0]!.fromId).toBe("danielle");
    expect(parentEdges[0]!.toId).toBe("nova");
    // Solo parent drop — not couple-bar geometry
    expect(parentEdges[0]!.path).not.toContain(`L ${coupleMid} `);

    expect(
      layout.edges.some(
        (e) => e.type === "parent_of" && e.fromId === "rob",
      ),
    ).toBe(false);

    expect(
      showsStepChildHint(
        remarriageEdges.map((e) => ({
          fromNodeId: e.fromNodeId,
          toNodeId: e.toNodeId,
          type: e.type,
        })),
        "nova",
      ),
    ).toBe(true);
    expect(
      showsStepChildHint(
        firstFamilyEdges.map((e) => ({
          fromNodeId: e.fromNodeId,
          toNodeId: e.toNodeId,
          type: e.type,
        })),
        "nova",
      ),
    ).toBe(false);
  });
});
