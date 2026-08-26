import { describe, expect, it } from "vitest";
import {
  describeRelationFromViewer,
  resolveRelationChoice,
} from "@/lib/family-tree/relations";

describe("resolveRelationChoice", () => {
  it("maps child to inverse parent_of", () => {
    expect(resolveRelationChoice("child", "kid", "mom")).toEqual({
      fromNodeId: "mom",
      toNodeId: "kid",
      type: "parent_of",
    });
  });

  it("maps niece and cousin", () => {
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
