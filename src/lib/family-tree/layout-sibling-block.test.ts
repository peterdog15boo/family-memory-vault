import { describe, expect, it } from "vitest";
import { computeFamilyTreeLayout, TREE_LAYOUT } from "@/lib/family-tree/layout";
import {
  addPartnerLink,
  emptyPartnerIndex,
  orderSiblingHouseholdsForFlank,
  packSiblingHouseholdRow,
  spousesOnRowOf,
} from "@/lib/family-tree/layout-iq";

/**
 * Permanent rule: Frank+Diane kids are one contiguous sibling spine.
 * Each sibling’s partners dock on that sibling’s outer side only.
 */
describe("sibling block contiguous packing", () => {
  it("packSiblingHouseholdRow keeps Teresa–Donna adjacent; partners stay with owner", () => {
    const ordered = orderSiblingHouseholdsForFlank(
      [
        { blood: "teresa", spouses: ["duane-sr", "dana"] },
        { blood: "donna", spouses: ["scott", "todd"] },
        { blood: "kevan", spouses: ["colleen"] },
      ],
      "right",
    );
    const row = packSiblingHouseholdRow(ordered, "right");
    // Heavier households outer: donna, teresa, then kevan
    expect(row).toEqual([
      "scott",
      "todd",
      "donna",
      "teresa",
      "duane-sr",
      "dana",
      "kevan",
      "colleen",
    ]);

    const di = row.indexOf("donna");
    const ti = row.indexOf("teresa");
    expect(Math.abs(di - ti)).toBe(1);
    for (const s of ["scott", "todd", "duane-sr", "dana", "colleen"]) {
      const si = row.indexOf(s);
      expect(si > Math.min(ti, di) && si < Math.max(ti, di)).toBe(false);
    }
  });

  it("preserves explicit blood order when not re-ordered", () => {
    const row = packSiblingHouseholdRow(
      [
        { blood: "teresa", spouses: ["duane-sr", "dana"] },
        { blood: "donna", spouses: ["scott", "todd"] },
        { blood: "kevan", spouses: ["colleen"] },
        { blood: "kathy", spouses: ["jeff"] },
      ],
      "right",
    );
    expect(row).toEqual([
      "duane-sr",
      "dana",
      "teresa",
      "donna",
      "scott",
      "todd",
      "kevan",
      "colleen",
      "kathy",
      "jeff",
    ]);
    expect(Math.abs(row.indexOf("teresa") - row.indexOf("donna"))).toBe(1);
  });

  it("spousesOnRowOf finds all multi-partners", () => {
    const partners = emptyPartnerIndex();
    addPartnerLink(partners, "donna", "scott");
    addPartnerLink(partners, "donna", "todd");
    const idSet = new Set(["donna", "scott", "todd", "teresa"]);
    expect(spousesOnRowOf("donna", idSet, partners)).toEqual([
      "scott",
      "todd",
    ]);
  });

  it("Frank+Diane kids stay contiguous; Scott/Todd dock to Donna only", () => {
    const nodes = [
      { id: "diane", label: "Diane" },
      { id: "frank", label: "Frank" },
      { id: "paul", label: "Paul" },
      { id: "helene", label: "Helene" },
      { id: "teresa", label: "Teresa" },
      { id: "donna", label: "Donna" },
      { id: "kevan", label: "Kevan" },
      { id: "kathy", label: "Kathy" },
      { id: "jeff", label: "Jeff" },
      { id: "todd", label: "Todd" },
      { id: "scott", label: "Scott" },
      { id: "colleen", label: "Colleen" },
      { id: "duane-sr", label: "Duane Sr" },
      { id: "dana", label: "Dana" },
      { id: "duane-jr", label: "Duane Jr" },
    ];
    const kids = ["teresa", "donna", "kevan", "kathy"] as const;
    const edges = [
      { fromNodeId: "diane", toNodeId: "frank", type: "partner_of" as const },
      { fromNodeId: "paul", toNodeId: "helene", type: "partner_of" as const },
      { fromNodeId: "kathy", toNodeId: "jeff", type: "partner_of" as const },
      { fromNodeId: "donna", toNodeId: "todd", type: "partner_of" as const },
      { fromNodeId: "donna", toNodeId: "scott", type: "partner_of" as const },
      { fromNodeId: "kevan", toNodeId: "colleen", type: "partner_of" as const },
      { fromNodeId: "teresa", toNodeId: "duane-sr", type: "partner_of" as const },
      { fromNodeId: "teresa", toNodeId: "dana", type: "partner_of" as const },
      { fromNodeId: "teresa", toNodeId: "duane-jr", type: "parent_of" as const },
      { fromNodeId: "duane-sr", toNodeId: "duane-jr", type: "parent_of" as const },
      // Dana is NOT a parent of Duane Jr.
      ...kids.flatMap((c) => [
        { fromNodeId: "diane", toNodeId: c, type: "parent_of" as const },
        { fromNodeId: "frank", toNodeId: c, type: "parent_of" as const },
      ]),
      { fromNodeId: "paul", toNodeId: "jeff", type: "parent_of" as const },
      { fromNodeId: "helene", toNodeId: "jeff", type: "parent_of" as const },
      { fromNodeId: "kathy", toNodeId: "donna", type: "sibling_of" as const },
      { fromNodeId: "kathy", toNodeId: "kevan", type: "sibling_of" as const },
      { fromNodeId: "kathy", toNodeId: "teresa", type: "sibling_of" as const },
      { fromNodeId: "donna", toNodeId: "kevan", type: "sibling_of" as const },
      { fromNodeId: "donna", toNodeId: "teresa", type: "sibling_of" as const },
      { fromNodeId: "kevan", toNodeId: "teresa", type: "sibling_of" as const },
    ];

    const layout = computeFamilyTreeLayout(nodes, edges);
    const by = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
    const mid = (id: string) => by[id]!.x + TREE_LAYOUT.nodeWidth / 2;

    expect(by.teresa!.y).toBe(by.kathy!.y);
    expect(by.donna!.y).toBe(by.kathy!.y);

    const row = Object.values(by)
      .filter((n) => n.y === by.kathy!.y)
      .sort((a, b) => a.x - b.x)
      .map((n) => n.id);

    const ti = row.indexOf("teresa");
    const di = row.indexOf("donna");
    expect(Math.abs(ti - di)).toBe(1);
    expect(row.slice(Math.min(ti, di) + 1, Math.max(ti, di))).toEqual([]);

    for (const spouse of ["scott", "todd", "duane-sr", "dana"] as const) {
      expect(row.includes(spouse)).toBe(true);
      const betweenTD =
        row.indexOf(spouse) > Math.min(ti, di) &&
        row.indexOf(spouse) < Math.max(ti, di);
      expect(betweenTD).toBe(false);
    }

    // Duane Jr under Teresa+Duane Sr generation below; Dana not a parent edge.
    expect(by["duane-jr"]!.y).toBeGreaterThan(by.teresa!.y);
    expect(
      edges.some(
        (e) =>
          e.type === "parent_of" &&
          e.fromNodeId === "dana" &&
          e.toNodeId === "duane-jr",
      ),
    ).toBe(false);
    void mid;
  });
});
