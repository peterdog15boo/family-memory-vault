import { describe, expect, it } from "vitest";
import {
  projectRelationshipsToConnectors,
  spouseConnectorPath,
} from "@/lib/family-tree/project-edges";
import { computeFamilyTreeLayout } from "@/lib/family-tree/layout";

describe("projectRelationshipsToConnectors", () => {
  it("projects every relationship with both endpoints placed", () => {
    const { connectors, verification } = projectRelationshipsToConnectors(
      [
        {
          id: "r1",
          fromNodeId: "mom",
          toNodeId: "dad",
          type: "partner_of",
        },
        {
          id: "r2",
          fromNodeId: "mom",
          toNodeId: "kid",
          type: "parent_of",
        },
        {
          id: "r3",
          fromNodeId: "dad",
          toNodeId: "kid",
          type: "parent_of",
        },
      ],
      [
        { id: "mom", x: 0, y: 0 },
        { id: "dad", x: 140, y: 0 },
        { id: "kid", x: 70, y: 200 },
      ],
    );

    expect(verification.ok).toBe(true);
    expect(verification.relationshipCount).toBe(3);
    expect(verification.renderedEdgeCount).toBe(3);
    expect(verification.relationshipsWithoutConnector).toEqual([]);
    expect(connectors.map((c) => c.relationshipId).sort()).toEqual([
      "r1",
      "r2",
      "r3",
    ]);
    expect(connectors.every((c) => c.path.length > 0)).toBe(true);
  });

  it("lists relationship ids that cannot render when a node is missing", () => {
    const { verification } = projectRelationshipsToConnectors(
      [
        {
          id: "missing-end",
          fromNodeId: "a",
          toNodeId: "ghost",
          type: "partner_of",
        },
      ],
      [{ id: "a", x: 0, y: 0 }],
    );
    expect(verification.ok).toBe(false);
    expect(verification.relationshipsWithoutConnector).toEqual([
      "missing-end",
    ]);
    expect(verification.renderedEdgeCount).toBe(0);
  });

  it("draws spouse connectors above node tops", () => {
    const geom = spouseConnectorPath(
      { id: "a", x: 0, y: 100 },
      { id: "b", x: 140, y: 100 },
    );
    expect(geom.path).toContain("L");
    // Top of the marriage bridge sits above y=100.
    expect(geom.labelY).toBeLessThan(100);
  });

  it("draws couple→child forks instead of crossing parent cubics", () => {
    const { connectors } = projectRelationshipsToConnectors(
      [
        {
          id: "r1",
          fromNodeId: "mom",
          toNodeId: "dad",
          type: "partner_of",
        },
        {
          id: "r2",
          fromNodeId: "mom",
          toNodeId: "kid",
          type: "parent_of",
        },
        {
          id: "r3",
          fromNodeId: "dad",
          toNodeId: "kid",
          type: "parent_of",
        },
      ],
      [
        { id: "mom", x: 0, y: 0 },
        { id: "dad", x: 140, y: 0 },
        { id: "kid", x: 70, y: 200 },
      ],
    );
    const parentPaths = connectors
      .filter((c) => c.type === "parent_of")
      .map((c) => c.path);
    expect(parentPaths).toHaveLength(2);
    // Shared couple midpoint stem (mom at 50, dad at 190 → mid 120).
    expect(parentPaths.every((p) => p.includes("L 120 "))).toBe(true);
    expect(parentPaths.every((p) => !p.includes("C "))).toBe(true);
  });
});

describe("relation label anchors", () => {
  const nodes = [
    { id: "harvey", label: "Harvey" },
    { id: "mary", label: "Mary" },
    { id: "diane", label: "Diane" },
    { id: "frank", label: "Frank" },
    { id: "paul", label: "Paul" },
    { id: "helene", label: "Helene" },
    { id: "scott", label: "Scott" },
    { id: "donna", label: "Donna" },
    { id: "todd", label: "Todd" },
    { id: "kathy", label: "Kathy" },
    { id: "jeff", label: "Jeff" },
  ];

  const edges = [
    { id: "e-hm", fromNodeId: "harvey", toNodeId: "mary", type: "partner_of" as const },
    { id: "e-hs", fromNodeId: "harvey", toNodeId: "scott", type: "parent_of" as const },
    { id: "e-ms", fromNodeId: "mary", toNodeId: "scott", type: "parent_of" as const },
    { id: "e-df", fromNodeId: "diane", toNodeId: "frank", type: "partner_of" as const },
    { id: "e-dk", fromNodeId: "diane", toNodeId: "kathy", type: "parent_of" as const },
    { id: "e-fk", fromNodeId: "frank", toNodeId: "kathy", type: "parent_of" as const },
    { id: "e-dd", fromNodeId: "diane", toNodeId: "donna", type: "parent_of" as const },
    { id: "e-fd", fromNodeId: "frank", toNodeId: "donna", type: "parent_of" as const },
    { id: "e-ph", fromNodeId: "paul", toNodeId: "helene", type: "partner_of" as const },
    { id: "e-pj", fromNodeId: "paul", toNodeId: "jeff", type: "parent_of" as const },
    { id: "e-hj", fromNodeId: "helene", toNodeId: "jeff", type: "parent_of" as const },
    { id: "e-kj", fromNodeId: "kathy", toNodeId: "jeff", type: "partner_of" as const },
    {
      id: "e-sib-dk",
      fromNodeId: "kathy",
      toNodeId: "donna",
      type: "sibling_of" as const,
    },
    {
      id: "e-spouse-dt",
      fromNodeId: "donna",
      toNodeId: "todd",
      type: "partner_of" as const,
    },
    {
      id: "e-cousin-sk",
      fromNodeId: "kathy",
      toNodeId: "scott",
      type: "cousin_of" as const,
    },
    {
      id: "e-sib-md",
      fromNodeId: "diane",
      toNodeId: "mary",
      type: "sibling_of" as const,
    },
  ];

  function endpoints(
    edge: { fromId: string; toId: string },
    a: string,
    b: string,
  ) {
    return (
      (edge.fromId === a && edge.toId === b) ||
      (edge.fromId === b && edge.toId === a)
    );
  }

  it("does not draw cousin polylines; keeps local sibling badges", () => {
    const layout = computeFamilyTreeLayout(nodes, edges);
    const by = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
    const mid = (id: string) => by[id]!.x + 50;

    const cousin = layout.edges.find((e) => e.type === "cousin_of");
    expect(cousin).toBeUndefined();
    // cousin_of stays in the graph for search / structure — just not drawn.
    expect(
      edges.some(
        (e) =>
          e.type === "cousin_of" &&
          ((e.fromNodeId === "kathy" && e.toNodeId === "scott") ||
            (e.fromNodeId === "scott" && e.toNodeId === "kathy")),
      ),
    ).toBe(true);

    // Sibling badges still sit on real sibling connectors.
    const sibDonnaKat = layout.edges.find(
      (e) => e.type === "sibling_of" && endpoints(e, "donna", "kathy"),
    );
    expect(sibDonnaKat?.label).toBe("Sibling");
    expect(sibDonnaKat!.labelY!).toBeLessThan(
      Math.min(by.donna!.y, by.kathy!.y),
    );
    expect(sibDonnaKat!.labelX!).toBeGreaterThan(
      Math.min(mid("donna"), mid("kathy")),
    );
    expect(sibDonnaKat!.labelX!).toBeLessThan(
      Math.max(mid("donna"), mid("kathy")),
    );

    const sibMaryDiane = layout.edges.find(
      (e) => e.type === "sibling_of" && endpoints(e, "mary", "diane"),
    );
    expect(sibMaryDiane?.label).toBe("Sibling");
    expect(sibMaryDiane!.labelY!).toBeLessThan(
      Math.min(by.mary!.y, by.diane!.y),
    );

    // Spouse connectors never inherit cousin/sibling badges.
    for (const e of layout.edges.filter((x) => x.type === "partner_of")) {
      expect(e.label).toBeUndefined();
    }
    // Parent drops stay unlabeled (avoid clutter).
    for (const e of layout.edges.filter((x) => x.type === "parent_of")) {
      expect(e.label).toBeUndefined();
    }
  });
});

describe("computeFamilyTreeLayout projection parity", () => {
  it("matches dialog source: every edge carries a relationshipId", () => {
    const layout = computeFamilyTreeLayout(
      [
        { id: "jeff-mom", label: "Mom" },
        { id: "jeff-dad", label: "Dad" },
        { id: "kathy-mom", label: "Mom" },
        { id: "kathy-dad", label: "Dad" },
        { id: "jeff", label: "Jeff" },
        { id: "kathy", label: "Kathy" },
      ],
      [
        {
          id: "e1",
          fromNodeId: "jeff-dad",
          toNodeId: "jeff-mom",
          type: "partner_of",
        },
        {
          id: "e2",
          fromNodeId: "jeff-mom",
          toNodeId: "jeff",
          type: "parent_of",
        },
        {
          id: "e3",
          fromNodeId: "jeff-dad",
          toNodeId: "jeff",
          type: "parent_of",
        },
        {
          id: "e4",
          fromNodeId: "kathy-dad",
          toNodeId: "kathy-mom",
          type: "partner_of",
        },
        {
          id: "e5",
          fromNodeId: "kathy-mom",
          toNodeId: "kathy",
          type: "parent_of",
        },
        {
          id: "e6",
          fromNodeId: "kathy-dad",
          toNodeId: "kathy",
          type: "parent_of",
        },
        {
          id: "e7",
          fromNodeId: "jeff",
          toNodeId: "kathy",
          type: "partner_of",
        },
      ],
    );

    expect(layout.edgeVerification.ok).toBe(true);
    expect(layout.edgeVerification.relationshipCount).toBe(7);
    expect(layout.edgeVerification.renderedEdgeCount).toBe(7);
    expect(
      layout.edges.filter((e) => e.type === "partner_of"),
    ).toHaveLength(3);
    expect(
      layout.edges.filter((e) => e.type === "parent_of"),
    ).toHaveLength(4);
  });
});
