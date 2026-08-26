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
