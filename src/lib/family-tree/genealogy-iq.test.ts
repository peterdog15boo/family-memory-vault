import { describe, expect, it } from "vitest";
import {
  canAutoSpouseCoParents,
  coParentsToAutoSpouse,
  inferredCoParentPairs,
  missingCoParentSpouseIds,
  preferredExistingCoParentId,
  spouseIdsOf,
  type GenealogyEdge,
} from "@/lib/family-tree/genealogy-iq";

const edges = (
  rows: Array<[string, string, GenealogyEdge["type"]]>,
): GenealogyEdge[] =>
  rows.map(([fromNodeId, toNodeId, type]) => ({
    fromNodeId,
    toNodeId,
    type,
  }));

describe("genealogy IQ helpers", () => {
  it("lists spouses of a node", () => {
    expect(
      spouseIdsOf(
        edges([
          ["a", "b", "partner_of"],
          ["a", "c", "parent_of"],
        ]),
        "a",
      ),
    ).toEqual(["b"]);
  });

  it("returns missing spouse co-parents for a new child", () => {
    expect(
      missingCoParentSpouseIds(
        edges([["mom", "dad", "partner_of"]]),
        "mom",
        "kid",
      ),
    ).toEqual(["dad"]);
  });

  it("skips spouses already linked as parents", () => {
    expect(
      missingCoParentSpouseIds(
        edges([
          ["mom", "dad", "partner_of"],
          ["mom", "kid", "parent_of"],
          ["dad", "kid", "parent_of"],
        ]),
        "mom",
        "kid",
      ),
    ).toEqual([]);
  });

  it("prefers an existing spouse when filling a second parent", () => {
    expect(
      preferredExistingCoParentId(
        edges([
          ["mom", "dad", "partner_of"],
          ["mom", "kid", "parent_of"],
        ]),
        "kid",
      ),
    ).toBe("dad");
  });

  it("returns null when no spouse can fill the parent slot", () => {
    expect(
      preferredExistingCoParentId(
        edges([["mom", "kid", "parent_of"]]),
        "kid",
      ),
    ).toBeNull();
  });

  it("auto-spouses Father with existing Mother when adding Father to Wife", () => {
    const rels = edges([["mom", "wife", "parent_of"]]);
    expect(coParentsToAutoSpouse(rels, "dad", "wife")).toEqual(["mom"]);
    expect(canAutoSpouseCoParents(rels, "dad", "mom")).toBe(true);
  });

  it("does not invent a competing spouse when Mother is already married", () => {
    const rels = edges([
      ["mom", "wife", "parent_of"],
      ["mom", "stepdad", "partner_of"],
    ]);
    expect(coParentsToAutoSpouse(rels, "dad", "wife")).toEqual([]);
    expect(canAutoSpouseCoParents(rels, "dad", "mom")).toBe(false);
  });

  it("skips auto-spouse when parents are already spouses", () => {
    const rels = edges([
      ["mom", "wife", "parent_of"],
      ["dad", "wife", "parent_of"],
      ["dad", "mom", "partner_of"],
    ]);
    expect(coParentsToAutoSpouse(rels, "dad", "wife")).toEqual([]);
  });

  it("infers a soft co-parent pair for layout when no spouse edge exists", () => {
    expect(
      inferredCoParentPairs(
        edges([
          ["mom", "wife", "parent_of"],
          ["dad", "wife", "parent_of"],
        ]),
      ),
    ).toEqual([["dad", "mom"]]);
  });
});
