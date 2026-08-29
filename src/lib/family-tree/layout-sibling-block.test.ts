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

  it("Frank+Diane kids stay contiguous even when Scott is also cousin_of Kat", () => {
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
      { id: "mary", label: "Mary" },
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
      // Production bug: Scott is also cousin_of Kat (aunt Mary’s son).
      { fromNodeId: "kathy", toNodeId: "scott", type: "cousin_of" as const },
      { fromNodeId: "diane", toNodeId: "mary", type: "sibling_of" as const },
      { fromNodeId: "teresa", toNodeId: "duane-jr", type: "parent_of" as const },
      { fromNodeId: "duane-sr", toNodeId: "duane-jr", type: "parent_of" as const },
      ...kids.flatMap((c) => [
        { fromNodeId: "diane", toNodeId: c, type: "parent_of" as const },
        { fromNodeId: "frank", toNodeId: c, type: "parent_of" as const },
      ]),
      { fromNodeId: "paul", toNodeId: "jeff", type: "parent_of" as const },
      { fromNodeId: "helene", toNodeId: "jeff", type: "parent_of" as const },
      // Sparse sibling_of like production (Kat↔Donna, Kat↔Kevan, Teresa↔Donna only).
      { fromNodeId: "kathy", toNodeId: "donna", type: "sibling_of" as const },
      { fromNodeId: "kathy", toNodeId: "kevan", type: "sibling_of" as const },
      { fromNodeId: "donna", toNodeId: "teresa", type: "sibling_of" as const },
    ];

    const layout = computeFamilyTreeLayout(nodes, edges);
    const by = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));

    expect(by.teresa!.y).toBe(by.kathy!.y);
    expect(by.donna!.y).toBe(by.kathy!.y);
    expect(by.kevan!.y).toBe(by.kathy!.y);

    const row = Object.values(by)
      .filter((n) => n.y === by.kathy!.y)
      .sort((a, b) => a.x - b.x)
      .map((n) => n.id);

    const blood = ["teresa", "donna", "kevan", "kathy"] as const;
    const bloodIdx = blood.map((id) => row.indexOf(id));
    expect(bloodIdx.every((i) => i >= 0)).toBe(true);
    // Contiguous blood spine: no non-sibling between the min and max blood index
    // except partners of those blood siblings.
    const lo = Math.min(...bloodIdx);
    const hi = Math.max(...bloodIdx);
    const between = row.slice(lo, hi + 1);
    for (const id of between) {
      if ((blood as readonly string[]).includes(id)) continue;
      const owner = blood.find((b) =>
        edges.some(
          (e) =>
            e.type === "partner_of" &&
            ((e.fromNodeId === b && e.toNodeId === id) ||
              (e.toNodeId === b && e.fromNodeId === id)),
        ),
      );
      expect(owner, `${id} must belong to a blood sibling`).toBeTruthy();
    }

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

    expect(by["duane-jr"]!.y).toBeGreaterThan(by.teresa!.y);
  });
});
