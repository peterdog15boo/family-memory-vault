import { describe, expect, it } from "vitest";
import { computeFamilyTreeLayout, TREE_LAYOUT } from "@/lib/family-tree/layout";
import {
  packSiblingHouseholdRow,
  spousesOnRowOf,
} from "@/lib/family-tree/layout-iq";

/**
 * Permanent rule: Frank+Diane kids are one contiguous sibling spine.
 * Spouses / in-laws dock on free ends — never between blood siblings.
 */
describe("sibling block contiguous packing", () => {
  it("packSiblingHouseholdRow keeps blood contiguous with spouses on ends", () => {
    const row = packSiblingHouseholdRow(
      [
        { blood: "teresa", spouses: [] },
        { blood: "donna", spouses: ["scott", "todd"] },
        { blood: "kevan", spouses: ["colleen"] },
      ],
      "right",
    );
    // Partnered claim ends: donna (outer), kevan (inner); teresa in spine.
    expect(row).toEqual([
      "scott",
      "todd",
      "donna",
      "teresa",
      "kevan",
      "colleen",
    ]);

    const blood = row.filter((id) =>
      ["teresa", "donna", "kevan"].includes(id),
    );
    expect(blood).toEqual(["donna", "teresa", "kevan"]);

    for (let i = 0; i < blood.length - 1; i++) {
      const a = row.indexOf(blood[i]!);
      const b = row.indexOf(blood[i + 1]!);
      const between = row.slice(a + 1, b);
      expect(between.every((id) => blood.includes(id))).toBe(true);
    }
  });

  it("spousesOnRowOf finds one-way multi-spouse partners", () => {
    const partnerOf = new Map<string, string>([
      ["donna", "scott"],
      ["scott", "donna"],
      ["todd", "donna"],
    ]);
    const idSet = new Set(["donna", "scott", "todd", "teresa"]);
    expect(spousesOnRowOf("donna", idSet, partnerOf)).toEqual([
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
    ];
    const kids = ["teresa", "donna", "kevan", "kathy"] as const;
    const edges = [
      { fromNodeId: "diane", toNodeId: "frank", type: "partner_of" as const },
      { fromNodeId: "paul", toNodeId: "helene", type: "partner_of" as const },
      { fromNodeId: "kathy", toNodeId: "jeff", type: "partner_of" as const },
      { fromNodeId: "donna", toNodeId: "todd", type: "partner_of" as const },
      { fromNodeId: "donna", toNodeId: "scott", type: "partner_of" as const },
      { fromNodeId: "kevan", toNodeId: "colleen", type: "partner_of" as const },
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
    expect(by.kevan!.y).toBe(by.kathy!.y);

    const row = Object.values(by)
      .filter((n) => n.y === by.kathy!.y)
      .sort((a, b) => a.x - b.x)
      .map((n) => n.id);

    // No non-sibling between Teresa and Donna.
    const ti = row.indexOf("teresa");
    const di = row.indexOf("donna");
    const betweenTD = row.slice(Math.min(ti, di) + 1, Math.max(ti, di));
    expect(betweenTD).toEqual([]);

    // Scott/Todd adjacent to Donna, not between Teresa and Donna.
    for (const spouse of ["scott", "todd"] as const) {
      expect(row.includes(spouse)).toBe(true);
      expect(Math.abs(mid(spouse) - mid("donna"))).toBeLessThan(
        Math.abs(mid(spouse) - mid("teresa")),
      );
      expect(Math.abs(row.indexOf(spouse) - di)).toBeLessThanOrEqual(2);
    }

    // Colleen docks to Kevan; Jeff docks to Kat.
    expect(Math.abs(mid("colleen") - mid("kevan"))).toBeLessThan(
      Math.abs(mid("colleen") - mid("donna")),
    );
    expect(Math.abs(by.jeff!.x - by.kathy!.x)).toBeLessThanOrEqual(
      TREE_LAYOUT.nodeWidth + TREE_LAYOUT.partnerGap + 1,
    );

    // Blood siblings appear as one run when in-laws are stripped.
    const bloodRun = row.filter((id) =>
      ["teresa", "donna", "kevan", "kathy"].includes(id),
    );
    expect(bloodRun.sort()).toEqual(
      ["donna", "kathy", "kevan", "teresa"].sort(),
    );
    const bloodIdx = bloodRun.map((id) => row.indexOf(id));
    expect(Math.max(...bloodIdx) - Math.min(...bloodIdx) + 1).toBeGreaterThanOrEqual(
      bloodRun.length,
    );
  });
});
