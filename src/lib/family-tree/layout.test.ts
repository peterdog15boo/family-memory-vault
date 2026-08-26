import { describe, expect, it } from "vitest";
import {
  computeFamilyTreeLayout,
  TREE_LAYOUT,
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

  it("places a child below and between both parents of a couple", () => {
    const layout = computeFamilyTreeLayout(
      [
        { id: "mom", label: "Mom" },
        { id: "dad", label: "Dad" },
        { id: "kid", label: "Kid" },
      ],
      [
        { fromNodeId: "dad", toNodeId: "mom", type: "partner_of" },
        { fromNodeId: "mom", toNodeId: "kid", type: "parent_of" },
        { fromNodeId: "dad", toNodeId: "kid", type: "parent_of" },
      ],
    );

    const mom = layout.nodes.find((n) => n.id === "mom")!;
    const dad = layout.nodes.find((n) => n.id === "dad")!;
    const kid = layout.nodes.find((n) => n.id === "kid")!;
    expect(kid.y).toBeGreaterThan(mom.y);
    expect(kid.y).toBeGreaterThan(dad.y);

    const coupleMid =
      (Math.min(mom.x, dad.x) +
        Math.max(mom.x, dad.x) +
        TREE_LAYOUT.nodeWidth) /
      2;
    const kidMid = kid.x + TREE_LAYOUT.nodeWidth / 2;
    expect(Math.abs(kidMid - coupleMid)).toBeLessThan(TREE_LAYOUT.nodeWidth);

    const parentEdges = layout.edges.filter((e) => e.type === "parent_of");
    expect(parentEdges).toHaveLength(2);
  });

  it("aligns partners even when only one has a parent, and draws every edge", () => {
    const layout = computeFamilyTreeLayout(
      [
        { id: "dad", label: "Dad" },
        { id: "jeff", label: "Jeff" },
        { id: "kathy", label: "Kathy" },
        { id: "scott", label: "Scott" },
        { id: "kathy-parent", label: "Mom" },
        { id: "scott-parent", label: "Uncle" },
      ],
      [
        { fromNodeId: "dad", toNodeId: "jeff", type: "parent_of" },
        { fromNodeId: "jeff", toNodeId: "kathy", type: "partner_of" },
        { fromNodeId: "kathy-parent", toNodeId: "kathy", type: "parent_of" },
        {
          fromNodeId: "scott-parent",
          toNodeId: "scott",
          type: "parent_of",
        },
        {
          fromNodeId: "kathy-parent",
          toNodeId: "scott-parent",
          type: "sibling_of",
        },
        { fromNodeId: "kathy", toNodeId: "scott", type: "cousin_of" },
      ],
    );

    const jeff = layout.nodes.find((n) => n.id === "jeff")!;
    const kathy = layout.nodes.find((n) => n.id === "kathy")!;
    const dad = layout.nodes.find((n) => n.id === "dad")!;
    expect(jeff.generation).toBe(kathy.generation);
    expect(dad.y).toBeLessThan(jeff.y);
    expect(layout.edges.some((e) => e.id === "parent:dad->jeff")).toBe(true);
    expect(layout.edges.some((e) => e.type === "cousin_of")).toBe(true);
    // No invented Jeff↔Scott link.
    expect(
      layout.edges.some(
        (e) =>
          (e.fromId === "jeff" && e.toId === "scott") ||
          (e.fromId === "scott" && e.toId === "jeff"),
      ),
    ).toBe(false);
  });
});

describe("treeNodeInitials", () => {
  it("builds initials from one or two words", () => {
    expect(treeNodeInitials("Grandpa")).toBe("GR");
    expect(treeNodeInitials("Aunt May")).toBe("AM");
    expect(treeNodeInitials("  ")).toBe("?");
  });
});
