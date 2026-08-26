import { describe, expect, it } from "vitest";
import {
  computeFamilyTreeLayout,
  treeNodeInitials,
} from "@/lib/family-tree/layout";

describe("computeFamilyTreeLayout", () => {
  it("places parent above child with a connecting path", () => {
    const layout = computeFamilyTreeLayout(
      [
        { id: "p", generation: 0, label: "Pat" },
        { id: "c", generation: 1, label: "Kid" },
      ],
      [{ fromNodeId: "p", toNodeId: "c", type: "parent_of" }],
    );

    expect(layout.nodes).toHaveLength(2);
    const parent = layout.nodes.find((n) => n.id === "p")!;
    const child = layout.nodes.find((n) => n.id === "c")!;
    expect(child.y).toBeGreaterThan(parent.y);
    expect(layout.edges.some((e) => e.type === "parent_of")).toBe(true);
    expect(layout.ghosts.length).toBeGreaterThan(0);
  });

  it("keeps partners side by side", () => {
    const layout = computeFamilyTreeLayout(
      [
        { id: "a", generation: 0, label: "Alex" },
        { id: "b", generation: 0, label: "Bailey" },
      ],
      [{ fromNodeId: "a", toNodeId: "b", type: "partner_of" }],
    );
    const a = layout.nodes.find((n) => n.id === "a")!;
    const b = layout.nodes.find((n) => n.id === "b")!;
    expect(a.y).toBe(b.y);
    expect(Math.abs(a.x - b.x)).toBeLessThan(140);
  });
});

describe("treeNodeInitials", () => {
  it("builds initials from one or two words", () => {
    expect(treeNodeInitials("Grandpa")).toBe("GR");
    expect(treeNodeInitials("Aunt May")).toBe("AM");
    expect(treeNodeInitials("  ")).toBe("?");
  });
});
