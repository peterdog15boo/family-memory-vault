import { describe, expect, it } from "vitest";
import {
  FAMILY_TREE_CIRCULAR_RELATIONSHIP_MESSAGE,
  isAncestorOf,
  validateFamilyTreeRelationship,
  validateFamilyTreeRelationshipBatch,
  wouldCreateParentCycle,
  type AncestryEdge,
} from "@/lib/family-tree/validate";

const parents = (
  pairs: Array<[string, string]>,
): AncestryEdge[] =>
  pairs.map(([fromNodeId, toNodeId]) => ({
    fromNodeId,
    toNodeId,
    type: "parent_of" as const,
  }));

describe("family tree cycle validation", () => {
  it("detects direct mutual parent/child", () => {
    const edges = parents([["a", "b"]]);
    expect(wouldCreateParentCycle(edges, "b", "a")).toBe(true);
    expect(
      validateFamilyTreeRelationship(edges, {
        fromNodeId: "b",
        toNodeId: "a",
        type: "parent_of",
      }).ok,
    ).toBe(false);
  });

  it("detects longer ancestry loops", () => {
    const edges = parents([
      ["a", "b"],
      ["b", "c"],
    ]);
    expect(isAncestorOf(edges, "a", "c")).toBe(true);
    expect(wouldCreateParentCycle(edges, "c", "a")).toBe(true);
    const result = validateFamilyTreeRelationship(edges, {
      fromNodeId: "c",
      toNodeId: "a",
      type: "parent_of",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(FAMILY_TREE_CIRCULAR_RELATIONSHIP_MESSAGE);
    }
  });

  it("allows a normal parent link", () => {
    const edges = parents([["mom", "kid"]]);
    expect(
      validateFamilyTreeRelationship(edges, {
        fromNodeId: "dad",
        toNodeId: "kid",
        type: "parent_of",
      }),
    ).toEqual({ ok: true });
  });

  it("rejects self parent", () => {
    const result = validateFamilyTreeRelationship([], {
      fromNodeId: "a",
      toNodeId: "a",
      type: "parent_of",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects sibling between ancestor and descendant", () => {
    const edges = parents([["p", "c"]]);
    const result = validateFamilyTreeRelationship(edges, {
      fromNodeId: "p",
      toNodeId: "c",
      type: "sibling_of",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe(FAMILY_TREE_CIRCULAR_RELATIONSHIP_MESSAGE);
    }
  });

  it("rejects partner between parent and child", () => {
    const edges = parents([["p", "c"]]);
    expect(
      validateFamilyTreeRelationship(edges, {
        fromNodeId: "p",
        toNodeId: "c",
        type: "partner_of",
      }).ok,
    ).toBe(false);
  });

  it("allows cousin when no ancestry line exists", () => {
    expect(
      validateFamilyTreeRelationship(parents([["m1", "a"], ["m2", "b"]]), {
        fromNodeId: "a",
        toNodeId: "b",
        type: "cousin_of",
      }),
    ).toEqual({ ok: true });
  });

  it("rejects cousin when one is ancestor of the other", () => {
    expect(
      validateFamilyTreeRelationship(parents([["a", "b"]]), {
        fromNodeId: "a",
        toNodeId: "b",
        type: "cousin_of",
      }).ok,
    ).toBe(false);
  });

  it("allows valid sibling and partner", () => {
    expect(
      validateFamilyTreeRelationship([], {
        fromNodeId: "a",
        toNodeId: "b",
        type: "sibling_of",
      }),
    ).toEqual({ ok: true });
    expect(
      validateFamilyTreeRelationship([], {
        fromNodeId: "a",
        toNodeId: "b",
        type: "partner_of",
      }),
    ).toEqual({ ok: true });
  });

  it("batch validation catches a cycle introduced by a later edge", () => {
    const existing = parents([["a", "b"]]);
    const result = validateFamilyTreeRelationshipBatch(existing, [
      { fromNodeId: "b", toNodeId: "c", type: "parent_of" },
      { fromNodeId: "c", toNodeId: "a", type: "parent_of" },
    ]);
    expect(result.ok).toBe(false);
  });

  it("batch allows scaffold-style cousin parents", () => {
    const result = validateFamilyTreeRelationshipBatch(
      [],
      [
        { fromNodeId: "mom-a", toNodeId: "alex", type: "parent_of" },
        { fromNodeId: "dad-a", toNodeId: "alex", type: "parent_of" },
        { fromNodeId: "dad-a", toNodeId: "mom-a", type: "partner_of" },
        { fromNodeId: "mom-b", toNodeId: "casey", type: "parent_of" },
        { fromNodeId: "dad-b", toNodeId: "casey", type: "parent_of" },
        { fromNodeId: "dad-b", toNodeId: "mom-b", type: "partner_of" },
        { fromNodeId: "mom-a", toNodeId: "mom-b", type: "sibling_of" },
        { fromNodeId: "alex", toNodeId: "casey", type: "cousin_of" },
      ],
    );
    expect(result).toEqual({ ok: true });
  });
});
