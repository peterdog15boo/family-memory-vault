import { describe, expect, it } from "vitest";
import { computeFamilyTreeLayout } from "@/lib/family-tree/layout";
import {
  sharedVisibleParents,
  shouldDrawSiblingConnector,
} from "@/lib/family-tree/project-edges";
import type { FamilyTreeRelationType } from "@/lib/db/schema";

describe("sibling connector render rules", () => {
  it("sharedVisibleParents is true when children hang from the same drawn union", () => {
    const parents = new Map<string, string[]>([
      ["kathy", ["diane", "frank"]],
      ["donna", ["diane", "frank"]],
      ["kevan", ["diane", "frank"]],
      ["betty", []],
      ["helene", []],
    ]);
    const placed = new Set(["diane", "frank", "kathy", "donna", "kevan", "betty", "helene"]);
    expect(sharedVisibleParents("kathy", "donna", parents, placed)).toBe(true);
    expect(sharedVisibleParents("kathy", "kevan", parents, placed)).toBe(true);
    expect(sharedVisibleParents("helene", "betty", parents, placed)).toBe(false);
  });

  it("Helene–Betty keeps a sibling line; Kat/Donna/Kevan do not; cousins stay undrawn", () => {
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
      { id: "kevan", label: "Kevan" },
      { id: "david", label: "David" },
    ];
    const edges: Array<{
      id: string;
      fromNodeId: string;
      toNodeId: string;
      type: FamilyTreeRelationType;
    }> = [
      { id: "e1", fromNodeId: "diane", toNodeId: "frank", type: "partner_of" },
      { id: "e2", fromNodeId: "diane", toNodeId: "kathy", type: "parent_of" },
      { id: "e3", fromNodeId: "frank", toNodeId: "kathy", type: "parent_of" },
      { id: "e4", fromNodeId: "diane", toNodeId: "donna", type: "parent_of" },
      { id: "e5", fromNodeId: "frank", toNodeId: "donna", type: "parent_of" },
      { id: "e6", fromNodeId: "diane", toNodeId: "kevan", type: "parent_of" },
      { id: "e7", fromNodeId: "frank", toNodeId: "kevan", type: "parent_of" },
      { id: "e8", fromNodeId: "paul", toNodeId: "helene", type: "partner_of" },
      { id: "e9", fromNodeId: "paul", toNodeId: "jeff", type: "parent_of" },
      { id: "e10", fromNodeId: "helene", toNodeId: "jeff", type: "parent_of" },
      { id: "e11", fromNodeId: "kathy", toNodeId: "jeff", type: "partner_of" },
      { id: "e12", fromNodeId: "kathy", toNodeId: "donna", type: "sibling_of" },
      { id: "e13", fromNodeId: "kathy", toNodeId: "kevan", type: "sibling_of" },
      { id: "e14", fromNodeId: "donna", toNodeId: "kevan", type: "sibling_of" },
      { id: "e15", fromNodeId: "betty", toNodeId: "helene", type: "sibling_of" },
      { id: "e16", fromNodeId: "betty", toNodeId: "ralph", type: "partner_of" },
      { id: "e17", fromNodeId: "betty", toNodeId: "david", type: "parent_of" },
      { id: "e18", fromNodeId: "ralph", toNodeId: "david", type: "parent_of" },
      { id: "e19", fromNodeId: "jeff", toNodeId: "david", type: "cousin_of" },
    ];

    const layout = computeFamilyTreeLayout(nodes, edges);
    const by = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));

    const siblingEdges = layout.edges.filter((e) => e.type === "sibling_of");
    const pair = (a: string, b: string) =>
      siblingEdges.some(
        (e) =>
          (e.fromId === a && e.toId === b) ||
          (e.fromId === b && e.toId === a),
      );

    expect(pair("kathy", "donna")).toBe(false);
    expect(pair("kathy", "kevan")).toBe(false);
    expect(pair("donna", "kevan")).toBe(false);
    expect(pair("helene", "betty")).toBe(true);

    const heleneBetty = siblingEdges.find(
      (e) =>
        (e.fromId === "helene" && e.toId === "betty") ||
        (e.fromId === "betty" && e.toId === "helene"),
    )!;
    expect(heleneBetty.label).toBe("Sibling");
    expect(heleneBetty.labelY!).toBeLessThan(
      Math.min(by.helene!.y, by.betty!.y),
    );

    expect(layout.edges.some((e) => e.type === "cousin_of")).toBe(false);
    // David under Betty does not invent sibling/cousin webs to Jeff
    expect(
      layout.edges.some(
        (e) =>
          (e.fromId === "david" && e.toId === "jeff") ||
          (e.fromId === "jeff" && e.toId === "david"),
      ),
    ).toBe(false);

    // Unit helpers agree with layout outcome for Helene–Betty
    const parents = new Map<string, string[]>();
    for (const e of edges) {
      if (e.type !== "parent_of") continue;
      const list = parents.get(e.toNodeId) ?? [];
      list.push(e.fromNodeId);
      parents.set(e.toNodeId, list);
    }
    const placed = new Set(layout.nodes.map((n) => n.id));
    expect(
      shouldDrawSiblingConnector(by.helene!, by.betty!, parents, placed),
    ).toBe(true);
    expect(
      shouldDrawSiblingConnector(by.kathy!, by.donna!, parents, placed),
    ).toBe(false);
  });
});
