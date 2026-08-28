import { describe, expect, it } from "vitest";
import { computeFamilyTreeLayout, TREE_LAYOUT } from "@/lib/family-tree/layout";
import { listCousinAttachCandidates } from "@/lib/family-tree/cousin-wizard";
import type { FamilyTreeRelationType } from "@/lib/db/schema";

/**
 * Wizard write shape (without DB): named parents + sibling attach + cousin_of
 * stored but not drawn; parents dock on P’s side.
 */
describe("addCousin wizard layout + render", () => {
  function layoutOf(
    nodes: Array<{ id: string; label: string }>,
    edges: Array<{
      fromNodeId: string;
      toNodeId: string;
      type: FamilyTreeRelationType;
    }>,
  ) {
    return computeFamilyTreeLayout(nodes, edges);
  }

  it("addCousin(Kat) with Mary+Harvey (Mary sibling of Diane) docks left", () => {
    const nodes = [
      { id: "diane", label: "Diane" },
      { id: "frank", label: "Frank" },
      { id: "paul", label: "Paul" },
      { id: "helene", label: "Helene" },
      { id: "kathy", label: "Kathy" },
      { id: "jeff", label: "Jeff" },
      { id: "mary", label: "Mary" },
      { id: "harvey", label: "Harvey" },
      { id: "scott", label: "Scott" },
    ];
    const edges: Array<{
      fromNodeId: string;
      toNodeId: string;
      type: FamilyTreeRelationType;
    }> = [
      { fromNodeId: "diane", toNodeId: "frank", type: "partner_of" },
      { fromNodeId: "diane", toNodeId: "kathy", type: "parent_of" },
      { fromNodeId: "frank", toNodeId: "kathy", type: "parent_of" },
      { fromNodeId: "paul", toNodeId: "helene", type: "partner_of" },
      { fromNodeId: "paul", toNodeId: "jeff", type: "parent_of" },
      { fromNodeId: "helene", toNodeId: "jeff", type: "parent_of" },
      { fromNodeId: "kathy", toNodeId: "jeff", type: "partner_of" },
      // Wizard writes:
      { fromNodeId: "mary", toNodeId: "harvey", type: "partner_of" },
      { fromNodeId: "mary", toNodeId: "scott", type: "parent_of" },
      { fromNodeId: "harvey", toNodeId: "scott", type: "parent_of" },
      { fromNodeId: "mary", toNodeId: "diane", type: "sibling_of" },
      { fromNodeId: "kathy", toNodeId: "scott", type: "cousin_of" },
    ];

    const candidates = listCousinAttachCandidates(
      { nodes, relationships: edges },
      "kathy",
    );
    expect(candidates.some((c) => c.id === "diane")).toBe(true);

    const layout = layoutOf(nodes, edges);
    const by = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
    const mid = (id: string) => by[id]!.x + TREE_LAYOUT.nodeWidth / 2;
    const coupleMid = (a: string, b: string) => (mid(a) + mid(b)) / 2;

    expect(by.mary!.y).toBe(by.diane!.y);
    expect(by.harvey!.y).toBe(by.diane!.y);
    expect(coupleMid("mary", "harvey")).toBeLessThan(
      coupleMid("kathy", "jeff"),
    );
    expect(by.scott!.y).toBe(by.kathy!.y);
    expect(by.scott!.x).toBeLessThan(by.kathy!.x);
    expect(Math.abs(mid("scott") - coupleMid("mary", "harvey"))).toBeLessThan(
      TREE_LAYOUT.nodeWidth * 1.5,
    );

    // No cousin polyline rendered
    expect(layout.edges.some((e) => e.type === "cousin_of")).toBe(false);
  });

  it("addCousin(Jeff) with Betty+Ralph (Betty sibling of Helene) docks right", () => {
    const nodes = [
      { id: "diane", label: "Diane" },
      { id: "frank", label: "Frank" },
      { id: "paul", label: "Paul" },
      { id: "helene", label: "Helene" },
      { id: "kathy", label: "Kathy" },
      { id: "jeff", label: "Jeff" },
      { id: "betty", label: "Betty" },
      { id: "ralph", label: "Ralph" },
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
      { fromNodeId: "paul", toNodeId: "helene", type: "partner_of" },
      { fromNodeId: "paul", toNodeId: "jeff", type: "parent_of" },
      { fromNodeId: "helene", toNodeId: "jeff", type: "parent_of" },
      { fromNodeId: "kathy", toNodeId: "jeff", type: "partner_of" },
      { fromNodeId: "betty", toNodeId: "ralph", type: "partner_of" },
      { fromNodeId: "betty", toNodeId: "david", type: "parent_of" },
      { fromNodeId: "ralph", toNodeId: "david", type: "parent_of" },
      { fromNodeId: "betty", toNodeId: "helene", type: "sibling_of" },
      { fromNodeId: "jeff", toNodeId: "david", type: "cousin_of" },
    ];

    const layout = layoutOf(nodes, edges);
    const by = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
    const mid = (id: string) => by[id]!.x + TREE_LAYOUT.nodeWidth / 2;
    const coupleMid = (a: string, b: string) => (mid(a) + mid(b)) / 2;

    expect(Math.min(by.betty!.x, by.ralph!.x)).toBeGreaterThan(
      Math.max(by.paul!.x, by.helene!.x),
    );
    expect(coupleMid("betty", "ralph")).toBeGreaterThan(
      coupleMid("paul", "helene"),
    );
    // Not packed at empty left x≈0
    expect(Math.min(by.betty!.x, by.ralph!.x)).toBeGreaterThan(200);
    expect(by.david!.y).toBe(by.jeff!.y);
    expect(by.david!.x).toBeGreaterThan(by.jeff!.x);
    expect(layout.edges.some((e) => e.type === "cousin_of")).toBe(false);

    // Left branch stays left
    expect(by.kathy!.x).toBeLessThan(by.jeff!.x);
    expect(coupleMid("diane", "frank")).toBeLessThan(
      coupleMid("kathy", "jeff"),
    );
  });
});
