import { describe, expect, it } from "vitest";
import { missingSharedSiblingParentLinks } from "@/lib/family-tree/sibling-parents";

describe("missingSharedSiblingParentLinks", () => {
  it("copies Kat’s parents onto Donna when Donna has none", () => {
    const missing = missingSharedSiblingParentLinks(
      [
        { fromNodeId: "diane", toNodeId: "kathy", type: "parent_of" },
        { fromNodeId: "frank", toNodeId: "kathy", type: "parent_of" },
        { fromNodeId: "kathy", toNodeId: "donna", type: "sibling_of" },
      ],
      "kathy",
      "donna",
    );
    expect(missing.sort((a, b) => a.parentId.localeCompare(b.parentId))).toEqual(
      [
        { parentId: "diane", childId: "donna" },
        { parentId: "frank", childId: "donna" },
      ],
    );
  });

  it("does not merge two different existing parent sets", () => {
    const missing = missingSharedSiblingParentLinks(
      [
        { fromNodeId: "diane", toNodeId: "kathy", type: "parent_of" },
        { fromNodeId: "other", toNodeId: "donna", type: "parent_of" },
      ],
      "kathy",
      "donna",
    );
    expect(missing).toEqual([]);
  });
});
