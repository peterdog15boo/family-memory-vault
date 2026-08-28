import { describe, expect, it } from "vitest";
import { computeFamilyTreeLayout, TREE_LAYOUT } from "@/lib/family-tree/layout";
import { planFamilyTreeRepair } from "@/lib/family-tree/repair";
import { inferFocusCouple, inferPersonSide } from "@/lib/family-tree/debug-export";
import type { FamilyTreeRelationType } from "@/lib/db/schema";

/**
 * addSpouse(Donna, Todd): Donna stays on Kat’s left, Todd docks as in-law,
 * and Donna keeps / gains Diane+Frank parents via sibling integrity.
 */
describe("addSpouse(Donna, Todd) sibling flank + parents", () => {
  const nodes = [
    { id: "diane", label: "Diane" },
    { id: "frank", label: "Frank" },
    { id: "paul", label: "Paul" },
    { id: "helene", label: "Helene" },
    { id: "jeff", label: "Jeff" },
    { id: "kathy", label: "Kathy" },
    { id: "donna", label: "Donna" },
    { id: "todd", label: "Todd" },
  ];

  const baseRels: Array<{
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
    { fromNodeId: "jeff", toNodeId: "kathy", type: "partner_of" },
    { fromNodeId: "kathy", toNodeId: "donna", type: "sibling_of" },
    { fromNodeId: "donna", toNodeId: "todd", type: "partner_of" },
  ];

  it("repair plans add_parent so Donna joins Diane+Frank", () => {
    const plan = planFamilyTreeRepair({
      nodes: nodes.map((n) => ({
        id: n.id,
        label: n.label,
        personId: null,
        notes: null,
      })),
      relationships: baseRels.map((r, i) => ({
        id: `e${i}`,
        fromNodeId: r.fromNodeId,
        toNodeId: r.toNodeId,
        type: r.type,
      })),
    });
    const parentOps = plan.ops.filter((o) => o.op === "add_parent");
    expect(
      parentOps.some(
        (o) =>
          o.op === "add_parent" &&
          o.parentId === "diane" &&
          o.childId === "donna",
      ),
    ).toBe(true);
    expect(
      parentOps.some(
        (o) =>
          o.op === "add_parent" &&
          o.parentId === "frank" &&
          o.childId === "donna",
      ),
    ).toBe(true);
  });

  it("keeps Donna+Todd on Kathy’s left beside Kat after parents are shared", () => {
    const withParents = [
      ...baseRels,
      { fromNodeId: "diane", toNodeId: "donna", type: "parent_of" as const },
      { fromNodeId: "frank", toNodeId: "donna", type: "parent_of" as const },
    ];
    const layout = computeFamilyTreeLayout(nodes, withParents);
    const by = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
    const mid = (id: string) => by[id]!.x + TREE_LAYOUT.nodeWidth / 2;

    expect(by.donna!.y).toBe(by.kathy!.y);
    expect(by.todd!.y).toBe(by.kathy!.y);

    const kathyLeft = by.kathy!.x < by.jeff!.x;
    if (kathyLeft) {
      expect(by.donna!.x).toBeLessThan(by.kathy!.x);
      expect(by.todd!.x).toBeLessThan(by.donna!.x);
      expect(by.donna!.x).toBeLessThan(by.jeff!.x);
    } else {
      expect(by.donna!.x).toBeGreaterThan(by.kathy!.x);
      expect(by.todd!.x).toBeGreaterThan(by.donna!.x);
    }

    expect(Math.abs(mid("donna") - mid("kathy"))).toBeLessThan(
      Math.abs(mid("donna") - mid("jeff")),
    );

    // Sibling edge still present; parents include Diane+Frank.
    expect(
      withParents.some(
        (e) =>
          e.type === "sibling_of" &&
          ((e.fromNodeId === "kathy" && e.toNodeId === "donna") ||
            (e.fromNodeId === "donna" && e.toNodeId === "kathy")),
      ),
    ).toBe(true);
    const donnaParents = withParents
      .filter((e) => e.type === "parent_of" && e.toNodeId === "donna")
      .map((e) => e.fromNodeId)
      .sort();
    expect(donnaParents).toEqual(["diane", "frank"]);
  });

  it("gives Todd Kathy’s lineage side (in-law of Donna)", () => {
    const rels = [
      ...baseRels,
      { fromNodeId: "diane", toNodeId: "donna", type: "parent_of" as const },
      { fromNodeId: "frank", toNodeId: "donna", type: "parent_of" as const },
    ].map((r, i) => ({
      id: `r${i}`,
      fromNodeId: r.fromNodeId,
      toNodeId: r.toNodeId,
      type: r.type,
      createdAt: new Date(),
    }));
    const focus = inferFocusCouple(nodes, rels)!;
    const donnaSide = inferPersonSide(rels, "donna", focus);
    const toddSide = inferPersonSide(rels, "todd", focus);
    expect(donnaSide).toBe("left");
    expect(toddSide).toBe(donnaSide);
    expect(toddSide).not.toBe("unattached");
  });
});
