import { describe, expect, it } from "vitest";
import { computeFamilyTreeLayout, TREE_LAYOUT } from "@/lib/family-tree/layout";

/**
 * Target traditional layout (layout-only; graph edges unchanged):
 *
 * Gen0: [Harvey+Mary]  [Diane+Frank]        [Paul+Helene]
 * Gen1: [Scott]        [Donna+Todd]         [Kat+Jeff]
 * Gen2:                      Noah
 */
describe("traditional focus-centered family layout", () => {
  const nodes = [
    { id: "harvey", label: "Harvey" },
    { id: "mary", label: "Mary" },
    { id: "diane", label: "Diane" },
    { id: "frank", label: "Frank" },
    { id: "paul", label: "Paul" },
    { id: "helene", label: "Helene" },
    { id: "scott", label: "Scott" },
    { id: "donna", label: "Donna" },
    { id: "todd", label: "Todd" },
    { id: "kathy", label: "Kathy" },
    { id: "jeff", label: "Jeff" },
    { id: "noah", label: "Noah" },
  ];

  const edges = [
    { fromNodeId: "harvey", toNodeId: "mary", type: "partner_of" as const },
    { fromNodeId: "harvey", toNodeId: "scott", type: "parent_of" as const },
    { fromNodeId: "mary", toNodeId: "scott", type: "parent_of" as const },
    { fromNodeId: "diane", toNodeId: "frank", type: "partner_of" as const },
    { fromNodeId: "diane", toNodeId: "kathy", type: "parent_of" as const },
    { fromNodeId: "frank", toNodeId: "kathy", type: "parent_of" as const },
    { fromNodeId: "diane", toNodeId: "donna", type: "parent_of" as const },
    { fromNodeId: "frank", toNodeId: "donna", type: "parent_of" as const },
    { fromNodeId: "paul", toNodeId: "helene", type: "partner_of" as const },
    { fromNodeId: "paul", toNodeId: "jeff", type: "parent_of" as const },
    { fromNodeId: "helene", toNodeId: "jeff", type: "parent_of" as const },
    { fromNodeId: "kathy", toNodeId: "jeff", type: "partner_of" as const },
    { fromNodeId: "kathy", toNodeId: "donna", type: "sibling_of" as const },
    { fromNodeId: "donna", toNodeId: "todd", type: "partner_of" as const },
    { fromNodeId: "kathy", toNodeId: "scott", type: "cousin_of" as const },
    { fromNodeId: "kathy", toNodeId: "noah", type: "parent_of" as const },
    { fromNodeId: "jeff", toNodeId: "noah", type: "parent_of" as const },
    {
      fromNodeId: "diane",
      toNodeId: "mary",
      type: "sibling_of" as const,
    },
  ];

  it("places parents, sibling couple, cousin, and child in traditional order", () => {
    const layout = computeFamilyTreeLayout(nodes, edges);
    const by = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
    const mid = (id: string) => by[id]!.x + TREE_LAYOUT.nodeWidth / 2;
    const coupleMid = (a: string, b: string) => (mid(a) + mid(b)) / 2;

    // Focus: Kat left of Jeff
    expect(by.kathy!.x).toBeLessThan(by.jeff!.x);
    expect(by.kathy!.y).toBe(by.jeff!.y);

    // Gen1: Scott | Donna+Todd | Kat+Jeff
    expect(by.scott!.y).toBe(by.kathy!.y);
    expect(by.donna!.y).toBe(by.kathy!.y);
    expect(by.todd!.y).toBe(by.kathy!.y);
    expect(by.scott!.x).toBeLessThan(by.todd!.x);
    expect(by.todd!.x).toBeLessThan(by.donna!.x);
    expect(by.donna!.x).toBeLessThan(by.kathy!.x);
    // Todd never sits between Scott and Donna as a loner — adjacent to Donna
    expect(Math.abs(by.donna!.x - by.todd!.x)).toBeLessThanOrEqual(
      TREE_LAYOUT.nodeWidth + TREE_LAYOUT.partnerGap + 1,
    );

    // Gen0 sides vs focus
    expect(coupleMid("paul", "helene")).toBeGreaterThan(
      coupleMid("kathy", "jeff"),
    );
    expect(coupleMid("diane", "frank")).toBeLessThan(
      coupleMid("kathy", "jeff"),
    );
    expect(coupleMid("harvey", "mary")).toBeLessThan(
      coupleMid("diane", "frank"),
    );

    // Jeff’s parents right; Kathy’s left; Scott’s further left
    expect(coupleMid("paul", "helene")).toBeGreaterThan(mid("jeff") - 40);
    expect(Math.abs(coupleMid("diane", "frank") - coupleMid("donna", "kathy"))).toBeLessThan(
      Math.abs(coupleMid("paul", "helene") - coupleMid("donna", "kathy")),
    );
    expect(Math.abs(coupleMid("harvey", "mary") - mid("scott"))).toBeLessThan(
      Math.abs(coupleMid("diane", "frank") - mid("scott")),
    );

    // Noah under Kat+Jeff
    expect(by.noah!.y).toBeGreaterThan(by.kathy!.y);
    expect(Math.abs(mid("noah") - coupleMid("kathy", "jeff"))).toBeLessThan(
      TREE_LAYOUT.nodeWidth,
    );
  });
});
