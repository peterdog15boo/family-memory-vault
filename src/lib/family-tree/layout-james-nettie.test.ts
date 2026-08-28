import { describe, expect, it } from "vitest";
import { computeFamilyTreeLayout, TREE_LAYOUT } from "@/lib/family-tree/layout";
import { planFamilyTreeRepair } from "@/lib/family-tree/repair";

/**
 * James+Nettie: daughters Helene and Betty may sit far apart under their own
 * spouses, but parent drops must originate at the couple midpoint.
 */
describe("James+Nettie couple parent drops", () => {
  const nodes = [
    { id: "james", label: "James McAuley" },
    { id: "nettie", label: "Nettie McAuley" },
    { id: "helene", label: "Helene Roberts" },
    { id: "paul", label: "Paul K Roberts" },
    { id: "betty", label: "Betty Foltz" },
    { id: "ralph", label: "Ralph Foltz" },
  ];

  const edges = [
    {
      id: "e-jn",
      fromNodeId: "james",
      toNodeId: "nettie",
      type: "partner_of" as const,
    },
    {
      id: "e-j-h",
      fromNodeId: "james",
      toNodeId: "helene",
      type: "parent_of" as const,
    },
    {
      id: "e-n-h",
      fromNodeId: "nettie",
      toNodeId: "helene",
      type: "parent_of" as const,
    },
    {
      id: "e-j-b",
      fromNodeId: "james",
      toNodeId: "betty",
      type: "parent_of" as const,
    },
    {
      id: "e-n-b",
      fromNodeId: "nettie",
      toNodeId: "betty",
      type: "parent_of" as const,
    },
    {
      id: "e-ph",
      fromNodeId: "paul",
      toNodeId: "helene",
      type: "partner_of" as const,
    },
    {
      id: "e-rb",
      fromNodeId: "ralph",
      toNodeId: "betty",
      type: "partner_of" as const,
    },
    {
      id: "e-hb",
      fromNodeId: "helene",
      toNodeId: "betty",
      type: "sibling_of" as const,
    },
  ];

  it("repair plans Nettie→Helene and Nettie→Betty when only James is linked", () => {
    const plan = planFamilyTreeRepair({
      nodes: nodes.map((n) => ({
        id: n.id,
        label: n.label,
        personId: null,
        notes: null,
      })),
      relationships: [
        {
          id: "e-jn",
          fromNodeId: "james",
          toNodeId: "nettie",
          type: "partner_of",
        },
        {
          id: "e-j-h",
          fromNodeId: "james",
          toNodeId: "helene",
          type: "parent_of",
        },
        {
          id: "e-j-b",
          fromNodeId: "james",
          toNodeId: "betty",
          type: "parent_of",
        },
        {
          id: "e-hb",
          fromNodeId: "helene",
          toNodeId: "betty",
          type: "sibling_of",
        },
      ],
    });

    expect(
      plan.ops.some(
        (o) =>
          o.op === "add_parent" &&
          o.parentId === "nettie" &&
          o.childId === "helene",
      ),
    ).toBe(true);
    expect(
      plan.ops.some(
        (o) =>
          o.op === "add_parent" &&
          o.parentId === "nettie" &&
          o.childId === "betty",
      ),
    ).toBe(true);
  });

  it("drops for Helene and Betty start at James+Nettie couple midpoint", () => {
    const layout = computeFamilyTreeLayout(nodes, edges);
    const by = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));

    expect(by.james!.y).toBe(by.nettie!.y);
    expect(by.helene!.y).toBeGreaterThan(by.james!.y);
    expect(by.betty!.y).toBe(by.helene!.y);

    const coupleMid =
      (Math.min(by.james!.x, by.nettie!.x) +
        Math.max(by.james!.x, by.nettie!.x) +
        TREE_LAYOUT.nodeWidth) /
      2;

    const parentDrops = layout.edges.filter(
      (e) =>
        e.type === "parent_of" &&
        (e.toId === "helene" || e.toId === "betty") &&
        (e.fromId === "james" || e.fromId === "nettie"),
    );
    expect(parentDrops.length).toBeGreaterThanOrEqual(2);
    for (const e of parentDrops) {
      expect(e.path).toContain(`L ${coupleMid} `);
    }

    // Daughters may sit far apart under their own spouses — still OK.
    expect(Math.abs(by.helene!.x - by.betty!.x)).toBeGreaterThan(
      TREE_LAYOUT.nodeWidth,
    );
  });
});
