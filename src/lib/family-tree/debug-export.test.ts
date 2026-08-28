import { describe, expect, it } from "vitest";
import {
  buildParentUnions,
  inferFocusCouple,
  inferPersonSide,
} from "@/lib/family-tree/debug-export";
import type { FamilyTreeRelationType } from "@/lib/db/schema";

type Rel = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  type: FamilyTreeRelationType;
  createdAt: Date;
};

function rel(
  id: string,
  fromNodeId: string,
  toNodeId: string,
  type: FamilyTreeRelationType,
): Rel {
  return { id, fromNodeId, toNodeId, type, createdAt: new Date() };
}

describe("family tree debug export helpers", () => {
  const nodes = [
    { id: "diane", label: "Diane" },
    { id: "frank", label: "Frank" },
    { id: "paul", label: "Paul" },
    { id: "helene", label: "Helene" },
    { id: "jeff", label: "Jeff" },
    { id: "kathy", label: "Kathy" },
    { id: "donna", label: "Donna" },
    { id: "scott", label: "Scott" },
    { id: "scott-mom", label: "Aunt" },
  ];

  const rels: Rel[] = [
    rel("1", "diane", "frank", "partner_of"),
    rel("2", "diane", "kathy", "parent_of"),
    rel("3", "frank", "kathy", "parent_of"),
    rel("4", "diane", "donna", "parent_of"),
    rel("5", "frank", "donna", "parent_of"),
    rel("6", "paul", "helene", "partner_of"),
    rel("7", "paul", "jeff", "parent_of"),
    rel("8", "helene", "jeff", "parent_of"),
    rel("9", "jeff", "kathy", "partner_of"),
    rel("10", "kathy", "donna", "sibling_of"),
    rel("11", "kathy", "scott", "cousin_of"),
    rel("12", "scott-mom", "scott", "parent_of"),
    rel("13", "diane", "scott-mom", "sibling_of"),
  ];

  it("infers Jeff+Kathy as focus couple with Kathy on the left bloodline", () => {
    const focus = inferFocusCouple(nodes, rels);
    expect(focus).not.toBeNull();
    expect([focus!.leftId, focus!.rightId].sort()).toEqual(
      ["jeff", "kathy"].sort(),
    );
  });

  it("puts Donna and Scott on Kathy’s side, not Jeff’s", () => {
    const focus = inferFocusCouple(nodes, rels)!;
    const kathyIsLeft = focus.leftId === "kathy";
    const kathySide = kathyIsLeft ? "left" : "right";
    const jeffSide = kathyIsLeft ? "right" : "left";

    expect(inferPersonSide(rels, "donna", focus)).toBe(kathySide);
    expect(inferPersonSide(rels, "scott", focus)).toBe(kathySide);
    expect(inferPersonSide(rels, "scott-mom", focus)).toBe(kathySide);
    expect(inferPersonSide(rels, "paul", focus)).toBe(jeffSide);
    expect(inferPersonSide(rels, "jeff", focus)).toBe("shared");
    expect(inferPersonSide(rels, "kathy", focus)).toBe("shared");
  });

  it("builds parent unions with children", () => {
    const focus = inferFocusCouple(nodes, rels);
    const unions = buildParentUnions(nodes, rels, focus);
    const kathyParents = unions.find(
      (u) =>
        u.spouseIds.includes("diane") && u.spouseIds.includes("frank"),
    );
    expect(kathyParents?.childIds.sort()).toEqual(["donna", "kathy"]);
  });
});
