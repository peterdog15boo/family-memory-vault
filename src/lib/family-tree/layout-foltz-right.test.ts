import { describe, expect, it } from "vitest";
import { computeFamilyTreeLayout, TREE_LAYOUT } from "@/lib/family-tree/layout";
import {
  inferFocusCouple,
  inferPersonSide,
} from "@/lib/family-tree/debug-export";
import type { FamilyTreeRelationType } from "@/lib/db/schema";

/**
 * Helene’s sister Betty + Ralph (and their son David) must inherit the RIGHT
 * side and dock beside Paul+Helene — never pack from empty left x.
 */
describe("Foltz aunt/uncle couple on Jeff’s right", () => {
  const nodes = [
    { id: "diane", label: "Diane" },
    { id: "frank", label: "Frank" },
    { id: "paul", label: "Paul" },
    { id: "helene", label: "Helene" },
    { id: "betty", label: "Betty" },
    { id: "ralph", label: "Ralph" },
    { id: "kathy", label: "Kathy" },
    { id: "jeff", label: "Jeff" },
    { id: "donna", label: "Donna" },
    { id: "scott", label: "Scott" },
    { id: "david", label: "David" },
  ];

  const edges: Array<{
    fromNodeId: string;
    toNodeId: string;
    type: FamilyTreeRelationType;
  }> = [
    { fromNodeId: "diane", toNodeId: "frank", type: "partner_of" },
    { fromNodeId: "diane", toNodeId: "kathy", type: "parent_of" },
    { fromNodeId: "frank", toNodeId: "kathy", type: "parent_of" },
    { fromNodeId: "diane", toNodeId: "donna", type: "parent_of" },
    { fromNodeId: "frank", toNodeId: "donna", type: "parent_of" },
    { fromNodeId: "paul", toNodeId: "helene", type: "partner_of" },
    { fromNodeId: "paul", toNodeId: "jeff", type: "parent_of" },
    { fromNodeId: "helene", toNodeId: "jeff", type: "parent_of" },
    { fromNodeId: "kathy", toNodeId: "jeff", type: "partner_of" },
    { fromNodeId: "kathy", toNodeId: "donna", type: "sibling_of" },
    { fromNodeId: "kathy", toNodeId: "scott", type: "cousin_of" },
    // Foltz — already correct; layout must not rewrite these.
    { fromNodeId: "betty", toNodeId: "helene", type: "sibling_of" },
    { fromNodeId: "ralph", toNodeId: "betty", type: "partner_of" },
    { fromNodeId: "betty", toNodeId: "david", type: "parent_of" },
    { fromNodeId: "ralph", toNodeId: "david", type: "parent_of" },
  ];

  it("keeps inferredSide right for Betty, Ralph, and David", () => {
    const rels = edges.map((e, i) => ({
      id: `r${i}`,
      fromNodeId: e.fromNodeId,
      toNodeId: e.toNodeId,
      type: e.type,
      createdAt: new Date(),
    }));
    const focus = inferFocusCouple(nodes, rels)!;
    expect(inferPersonSide(rels, "betty", focus)).toBe("right");
    expect(inferPersonSide(rels, "ralph", focus)).toBe("right");
    expect(inferPersonSide(rels, "david", focus)).toBe("right");
  });

  it("places Betty+Ralph right of Paul+Helene and David under them on Jeff’s side", () => {
    const layout = computeFamilyTreeLayout(nodes, edges);
    const by = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
    const mid = (id: string) => by[id]!.x + TREE_LAYOUT.nodeWidth / 2;
    const coupleMid = (a: string, b: string) => (mid(a) + mid(b)) / 2;

    // Gen0: Betty+Ralph immediately right of Paul+Helene
    expect(by.betty!.y).toBe(by.helene!.y);
    expect(by.ralph!.y).toBe(by.helene!.y);
    expect(Math.min(by.betty!.x, by.ralph!.x)).toBeGreaterThan(
      Math.max(by.paul!.x, by.helene!.x),
    );
    expect(coupleMid("betty", "ralph")).toBeGreaterThan(
      coupleMid("paul", "helene"),
    );

    // David on Jeff’s generation, right half, under Betty+Ralph
    expect(by.david!.y).toBe(by.jeff!.y);
    expect(by.david!.x).toBeGreaterThan(by.jeff!.x);
    expect(Math.abs(mid("david") - coupleMid("betty", "ralph"))).toBeLessThan(
      TREE_LAYOUT.nodeWidth * 1.5,
    );

    // Kathy’s left branch stays left — no side flip to make room
    expect(by.kathy!.x).toBeLessThan(by.jeff!.x);
    expect(by.donna!.x).toBeLessThan(by.kathy!.x);
    expect(by.scott!.x).toBeLessThan(by.kathy!.x);
    expect(coupleMid("diane", "frank")).toBeLessThan(
      coupleMid("kathy", "jeff"),
    );
    expect(coupleMid("paul", "helene")).toBeGreaterThan(
      coupleMid("kathy", "jeff"),
    );
  });
});
