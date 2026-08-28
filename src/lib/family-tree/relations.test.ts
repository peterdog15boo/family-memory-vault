import { describe, expect, it } from "vitest";
import {
  describeRelationFromViewer,
  FAMILY_TREE_RELATION_CHOICES,
  resolveRelationChoice,
} from "@/lib/family-tree/relations";

describe("FAMILY_TREE_RELATION_CHOICES (Add menu)", () => {
  it("offers only parent, partner, child, and sibling", () => {
    expect(FAMILY_TREE_RELATION_CHOICES.map((c) => c.id).sort()).toEqual([
      "child",
      "parent",
      "partner",
      "sibling",
    ]);
    expect(
      FAMILY_TREE_RELATION_CHOICES.some((c) =>
        [
          "cousin",
          "niece",
          "nephew",
          "sister_in_law",
          "brother_in_law",
          "other",
        ].includes(c.id),
      ),
    ).toBe(false);
  });
});

describe("resolveRelationChoice", () => {
  it("maps child to inverse parent_of", () => {
    expect(resolveRelationChoice("child", "kid", "mom")).toEqual({
      fromNodeId: "mom",
      toNodeId: "kid",
      type: "parent_of",
    });
  });

  it("still resolves legacy cousin/niece for stored edges (not Add UI)", () => {
    expect(resolveRelationChoice("niece", "n", "a")).toEqual({
      fromNodeId: "n",
      toNodeId: "a",
      type: "niece_of",
    });
    expect(resolveRelationChoice("cousin", "a", "b").type).toBe("cousin_of");
  });
});

describe("describeRelationFromViewer", () => {
  it("flips parent/niece phrasing for the other endpoint", () => {
    expect(describeRelationFromViewer("parent_of", true)).toBe("Parent of");
    expect(describeRelationFromViewer("parent_of", false)).toBe("Child of");
    expect(describeRelationFromViewer("niece_of", true)).toBe("Niece of");
    expect(describeRelationFromViewer("niece_of", false)).toBe("Aunt/uncle of");
  });
});
