import { describe, expect, it } from "vitest";
import {
  orderGenerationForLayout,
  orientCouple,
  outerSiblingsOf,
} from "@/lib/family-tree/layout-iq";
import { computeFamilyTreeLayout, TREE_LAYOUT } from "@/lib/family-tree/layout";

function ctx(input: {
  partners?: Array<[string, string]>;
  siblings?: Array<[string, string]>;
  parents?: Array<[string, string]>; // parent, child
}) {
  const partnerOf = new Map<string, string>();
  for (const [a, b] of input.partners ?? []) {
    partnerOf.set(a, b);
    partnerOf.set(b, a);
  }
  const siblingAdj = new Map<string, Set<string>>();
  for (const [a, b] of input.siblings ?? []) {
    const sa = siblingAdj.get(a) ?? new Set();
    sa.add(b);
    siblingAdj.set(a, sa);
    const sb = siblingAdj.get(b) ?? new Set();
    sb.add(a);
    siblingAdj.set(b, sb);
  }
  const parentsByChild = new Map<string, string[]>();
  for (const [parent, child] of input.parents ?? []) {
    const list = parentsByChild.get(child) ?? [];
    list.push(parent);
    parentsByChild.set(child, list);
  }
  return { partnerOf, siblingAdj, parentsByChild };
}

describe("orderGenerationForLayout", () => {
  it("places wife’s sister on the wife’s outer side, not past the husband", () => {
    const ordered = orderGenerationForLayout(
      ["jeff", "kathy", "sue"],
      ctx({
        partners: [["jeff", "kathy"]],
        siblings: [["kathy", "sue"]],
        parents: [
          ["j-dad", "jeff"],
          ["k-dad", "kathy"],
          ["k-dad", "sue"],
        ],
      }),
    );

    const jeff = ordered.indexOf("jeff");
    const kathy = ordered.indexOf("kathy");
    const sue = ordered.indexOf("sue");
    expect(Math.abs(jeff - kathy)).toBe(1);
    // Sue is adjacent to Kathy and on Kathy's outer side (away from Jeff).
    expect(Math.abs(sue - kathy)).toBe(1);
    expect(sue).not.toBe(jeff);
    // Outer: either [jeff, kathy, sue] or [sue, kathy, jeff]
    const kathyBetweenJeffAndSue =
      (jeff < kathy && kathy < sue) || (sue < kathy && kathy < jeff);
    expect(kathyBetweenJeffAndSue).toBe(true);
  });

  it("places husband’s brother on the husband’s outer side", () => {
    const ordered = orderGenerationForLayout(
      ["jeff", "kathy", "bob"],
      ctx({
        partners: [["jeff", "kathy"]],
        siblings: [["jeff", "bob"]],
        parents: [
          ["j-dad", "jeff"],
          ["j-dad", "bob"],
          ["k-dad", "kathy"],
        ],
      }),
    );

    const jeff = ordered.indexOf("jeff");
    const kathy = ordered.indexOf("kathy");
    const bob = ordered.indexOf("bob");
    expect(Math.abs(jeff - kathy)).toBe(1);
    expect(Math.abs(bob - jeff)).toBe(1);
    const jeffBetweenBobAndKathy =
      (bob < jeff && jeff < kathy) || (kathy < jeff && jeff < bob);
    expect(jeffBetweenBobAndKathy).toBe(true);
  });
});

describe("outerSiblingsOf", () => {
  it("excludes the spouse from sibling slots", () => {
    const c = ctx({
      partners: [["jeff", "kathy"]],
      siblings: [["kathy", "sue"]],
    });
    const sibs = outerSiblingsOf(
      "kathy",
      new Set(["jeff", "kathy", "sue"]),
      c,
      new Set(["jeff", "kathy"]),
    );
    expect(sibs).toEqual(["sue"]);
  });
});

describe("orientCouple", () => {
  it("prefers parent-key ordering when bloodlines differ", () => {
    const c = ctx({
      parents: [
        ["a-dad", "amy"],
        ["z-dad", "zack"],
      ],
    });
    expect(orientCouple("zack", "amy", c)).toEqual(["amy", "zack"]);
  });
});

describe("computeFamilyTreeLayout Layout IQ", () => {
  it("places wife’s sister beside the wife on the same generation", () => {
    const layout = computeFamilyTreeLayout(
      [
        { id: "jeff", label: "Jeff" },
        { id: "kathy", label: "Kathy" },
        { id: "sue", label: "Sue" },
      ],
      [
        { fromNodeId: "jeff", toNodeId: "kathy", type: "partner_of" },
        { fromNodeId: "kathy", toNodeId: "sue", type: "sibling_of" },
      ],
    );

    const jeff = layout.nodes.find((n) => n.id === "jeff")!;
    const kathy = layout.nodes.find((n) => n.id === "kathy")!;
    const sue = layout.nodes.find((n) => n.id === "sue")!;

    expect(jeff.generation).toBe(kathy.generation);
    expect(sue.generation).toBe(kathy.generation);
    expect(jeff.y).toBe(kathy.y);
    expect(sue.y).toBe(kathy.y);

    // Sue is closer to Kathy than to Jeff.
    const sueMid = sue.x + TREE_LAYOUT.nodeWidth / 2;
    const kathyMid = kathy.x + TREE_LAYOUT.nodeWidth / 2;
    const jeffMid = jeff.x + TREE_LAYOUT.nodeWidth / 2;
    expect(Math.abs(sueMid - kathyMid)).toBeLessThan(
      Math.abs(sueMid - jeffMid),
    );

    // Sue is on Kathy's outer side (not between Jeff and Kathy).
    const jeffLeft = jeff.x < kathy.x;
    if (jeffLeft) {
      expect(sue.x).toBeGreaterThan(kathy.x);
    } else {
      expect(sue.x).toBeLessThan(kathy.x);
    }
  });

  it("places husband’s sibling beside the husband on his outer side", () => {
    const layout = computeFamilyTreeLayout(
      [
        { id: "jeff", label: "Jeff" },
        { id: "kathy", label: "Kathy" },
        { id: "bob", label: "Bob" },
      ],
      [
        { fromNodeId: "jeff", toNodeId: "kathy", type: "partner_of" },
        { fromNodeId: "jeff", toNodeId: "bob", type: "sibling_of" },
      ],
    );

    const jeff = layout.nodes.find((n) => n.id === "jeff")!;
    const kathy = layout.nodes.find((n) => n.id === "kathy")!;
    const bob = layout.nodes.find((n) => n.id === "bob")!;

    expect(bob.y).toBe(jeff.y);
    const bobMid = bob.x + TREE_LAYOUT.nodeWidth / 2;
    const jeffMid = jeff.x + TREE_LAYOUT.nodeWidth / 2;
    const kathyMid = kathy.x + TREE_LAYOUT.nodeWidth / 2;
    expect(Math.abs(bobMid - jeffMid)).toBeLessThan(
      Math.abs(bobMid - kathyMid),
    );

    const jeffLeft = jeff.x < kathy.x;
    if (jeffLeft) {
      expect(bob.x).toBeLessThan(jeff.x);
    } else {
      expect(bob.x).toBeGreaterThan(jeff.x);
    }
  });

  it("keeps parents above the correct spouse and children under the couple", () => {
    const layout = computeFamilyTreeLayout(
      [
        { id: "j-mom", label: "Mom" },
        { id: "j-dad", label: "Dad" },
        { id: "k-mom", label: "Mom" },
        { id: "k-dad", label: "Dad" },
        { id: "jeff", label: "Jeff" },
        { id: "kathy", label: "Kathy" },
        { id: "sue", label: "Sue" },
        { id: "kid", label: "Kid" },
      ],
      [
        { fromNodeId: "j-dad", toNodeId: "j-mom", type: "partner_of" },
        { fromNodeId: "j-mom", toNodeId: "jeff", type: "parent_of" },
        { fromNodeId: "j-dad", toNodeId: "jeff", type: "parent_of" },
        { fromNodeId: "k-dad", toNodeId: "k-mom", type: "partner_of" },
        { fromNodeId: "k-mom", toNodeId: "kathy", type: "parent_of" },
        { fromNodeId: "k-dad", toNodeId: "kathy", type: "parent_of" },
        { fromNodeId: "k-mom", toNodeId: "sue", type: "parent_of" },
        { fromNodeId: "k-dad", toNodeId: "sue", type: "parent_of" },
        { fromNodeId: "jeff", toNodeId: "kathy", type: "partner_of" },
        { fromNodeId: "kathy", toNodeId: "sue", type: "sibling_of" },
        { fromNodeId: "jeff", toNodeId: "kid", type: "parent_of" },
        { fromNodeId: "kathy", toNodeId: "kid", type: "parent_of" },
      ],
    );

    const jeff = layout.nodes.find((n) => n.id === "jeff")!;
    const kathy = layout.nodes.find((n) => n.id === "kathy")!;
    const sue = layout.nodes.find((n) => n.id === "sue")!;
    const kid = layout.nodes.find((n) => n.id === "kid")!;
    const jMom = layout.nodes.find((n) => n.id === "j-mom")!;
    const kMom = layout.nodes.find((n) => n.id === "k-mom")!;

    expect(jMom.y).toBeLessThan(jeff.y);
    expect(kMom.y).toBeLessThan(kathy.y);
    expect(kid.y).toBeGreaterThan(jeff.y);

    const sueMid = sue.x + TREE_LAYOUT.nodeWidth / 2;
    const kathyMid = kathy.x + TREE_LAYOUT.nodeWidth / 2;
    const jeffMid = jeff.x + TREE_LAYOUT.nodeWidth / 2;
    expect(Math.abs(sueMid - kathyMid)).toBeLessThan(
      Math.abs(sueMid - jeffMid),
    );

    const coupleMid = (jeffMid + kathyMid) / 2;
    expect(
      Math.abs(kid.x + TREE_LAYOUT.nodeWidth / 2 - coupleMid),
    ).toBeLessThan(TREE_LAYOUT.nodeWidth * 1.5);
  });
});
