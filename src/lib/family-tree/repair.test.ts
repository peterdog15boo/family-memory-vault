import { describe, expect, it } from "vitest";
import {
  parseMergedCoupleLabel,
  planFamilyTreeRepair,
  withReviewFlag,
  nodeNeedsReview,
  clearReviewFlag,
} from "@/lib/family-tree/repair";

describe("parseMergedCoupleLabel", () => {
  it("splits Jeff & Kathy style labels", () => {
    expect(parseMergedCoupleLabel("Jeff & Kathy")).toEqual({
      nameA: "Jeff",
      nameB: "Kathy",
    });
    expect(parseMergedCoupleLabel("Jeff and Kathy")).toEqual({
      nameA: "Jeff",
      nameB: "Kathy",
    });
    expect(parseMergedCoupleLabel("Mom / Dad")).toEqual({
      nameA: "Mom",
      nameB: "Dad",
    });
  });

  it("leaves single names alone", () => {
    expect(parseMergedCoupleLabel("Jeff")).toBeNull();
    expect(parseMergedCoupleLabel("Mary Ann")).toBeNull();
  });
});

describe("planFamilyTreeRepair", () => {
  it("plans a split + spouse link for a merged couple with shared children", () => {
    const plan = planFamilyTreeRepair({
      nodes: [
        { id: "jk", label: "Jeff & Kathy", personId: null, notes: null },
        { id: "kid", label: "Sam", personId: null, notes: null },
      ],
      relationships: [
        {
          id: "e1",
          fromNodeId: "jk",
          toNodeId: "kid",
          type: "parent_of",
        },
      ],
    });

    expect(plan.ops.some((o) => o.op === "split_merged_label")).toBe(true);
    const split = plan.ops.find((o) => o.op === "split_merged_label");
    expect(split).toMatchObject({
      op: "split_merged_label",
      nodeId: "jk",
      nameA: "Jeff",
      nameB: "Kathy",
      shareChildren: true,
    });
    expect(plan.summary).toMatch(/fixed/i);
  });

  it("pairs two co-parents with a spouse link when safe", () => {
    const plan = planFamilyTreeRepair({
      nodes: [
        { id: "mom", label: "Mom", personId: null, notes: null },
        { id: "dad", label: "Dad", personId: null, notes: null },
        { id: "kid", label: "Alex", personId: null, notes: null },
      ],
      relationships: [
        { id: "e1", fromNodeId: "mom", toNodeId: "kid", type: "parent_of" },
        { id: "e2", fromNodeId: "dad", toNodeId: "kid", type: "parent_of" },
      ],
    });

    expect(
      plan.ops.some(
        (o) =>
          o.op === "add_partner" &&
          ((o.a === "mom" && o.b === "dad") ||
            (o.a === "dad" && o.b === "mom")),
      ),
    ).toBe(true);
  });

  it("flips mislinked co-parent siblings to partners", () => {
    const plan = planFamilyTreeRepair({
      nodes: [
        { id: "mom", label: "Mom", personId: null, notes: null },
        { id: "dad", label: "Dad", personId: null, notes: null },
        { id: "kid", label: "Alex", personId: null, notes: null },
      ],
      relationships: [
        { id: "e1", fromNodeId: "mom", toNodeId: "kid", type: "parent_of" },
        { id: "e2", fromNodeId: "dad", toNodeId: "kid", type: "parent_of" },
        { id: "e3", fromNodeId: "dad", toNodeId: "mom", type: "sibling_of" },
      ],
    });

    expect(
      plan.ops.some(
        (o) => o.op === "flip_sibling_to_partner" && o.edgeId === "e3",
      ),
    ).toBe(true);
  });

  it("flags cross-spouse parent fan-in without deleting", () => {
    const plan = planFamilyTreeRepair({
      nodes: [
        { id: "jeff", label: "Jeff", personId: null, notes: null },
        { id: "kathy", label: "Kathy", personId: null, notes: null },
        { id: "gp", label: "Grandpa", personId: null, notes: null },
      ],
      relationships: [
        {
          id: "e1",
          fromNodeId: "jeff",
          toNodeId: "kathy",
          type: "partner_of",
        },
        { id: "e2", fromNodeId: "gp", toNodeId: "jeff", type: "parent_of" },
        { id: "e3", fromNodeId: "gp", toNodeId: "kathy", type: "parent_of" },
      ],
    });

    expect(plan.ops.some((o) => o.op === "delete_edge")).toBe(false);
    expect(
      plan.ops.filter((o) => o.op === "flag_review").map((o) => o.nodeId).sort(),
    ).toEqual(["gp", "jeff", "kathy"]);
  });

  it("removes cousin-as-child phantom parent edges", () => {
    const plan = planFamilyTreeRepair({
      nodes: [
        { id: "a", label: "Alex", personId: null, notes: null },
        { id: "c", label: "Casey", personId: null, notes: null },
      ],
      relationships: [
        { id: "e1", fromNodeId: "a", toNodeId: "c", type: "cousin_of" },
        { id: "e2", fromNodeId: "a", toNodeId: "c", type: "parent_of" },
      ],
    });

    expect(
      plan.ops.some(
        (o) => o.op === "delete_edge" && o.edgeId === "e2",
      ),
    ).toBe(true);
  });

  it("retargets a cousin bridge from the spouse’s parents onto Kathy’s side", () => {
    const plan = planFamilyTreeRepair({
      nodes: [
        { id: "jeff", label: "Jeff", personId: null, notes: null },
        { id: "kathy", label: "Kathy", personId: null, notes: null },
        { id: "scott", label: "Scott", personId: null, notes: null },
        { id: "jeff-dad", label: "Dad", personId: null, notes: null },
        { id: "kathy-mom", label: "Mom", personId: null, notes: null },
        { id: "scott-mom", label: "Aunt", personId: null, notes: null },
      ],
      relationships: [
        { id: "p1", fromNodeId: "jeff", toNodeId: "kathy", type: "partner_of" },
        {
          id: "p2",
          fromNodeId: "jeff-dad",
          toNodeId: "jeff",
          type: "parent_of",
        },
        {
          id: "p3",
          fromNodeId: "kathy-mom",
          toNodeId: "kathy",
          type: "parent_of",
        },
        {
          id: "p4",
          fromNodeId: "scott-mom",
          toNodeId: "scott",
          type: "parent_of",
        },
        // Wrong: Scott’s mom bridged to Jeff’s dad instead of Kathy’s mom
        {
          id: "bad-bridge",
          fromNodeId: "jeff-dad",
          toNodeId: "scott-mom",
          type: "sibling_of",
        },
        {
          id: "c1",
          fromNodeId: "kathy",
          toNodeId: "scott",
          type: "cousin_of",
        },
      ],
    });

    const retarget = plan.ops.find((o) => o.op === "retarget_edge");
    expect(retarget).toMatchObject({
      op: "retarget_edge",
      edgeId: "bad-bridge",
    });
    if (retarget?.op === "retarget_edge") {
      const ends = [retarget.fromNodeId, retarget.toNodeId].sort();
      expect(ends).toEqual(["kathy-mom", "scott-mom"].sort());
    }
  });

  it("does not invent deletions of unrelated people", () => {
    const plan = planFamilyTreeRepair({
      nodes: [
        { id: "a", label: "Alex", personId: null, notes: null },
        { id: "b", label: "Bailey", personId: null, notes: null },
      ],
      relationships: [],
    });
    expect(plan.ops.every((o) => o.op !== "delete_edge")).toBe(true);
    expect(plan.ops).toHaveLength(0);
  });
});

describe("review flag notes", () => {
  it("round-trips needs-review markers", () => {
    const flagged = withReviewFlag(null, "Check parents");
    expect(nodeNeedsReview(flagged)).toBe(true);
    const dismissed = clearReviewFlag(flagged);
    expect(nodeNeedsReview(dismissed)).toBe(false);
    expect(dismissed).toContain("[review-dismissed]");
  });
});
