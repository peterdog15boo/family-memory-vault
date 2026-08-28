import { describe, expect, it } from "vitest";
import {
  analyzeCousinLineage,
  cousinsLinkedOnSubjectLineage,
  preferCousinSubjectId,
} from "@/lib/family-tree/cousin-lineage";
import { computeFamilyTreeLayout, TREE_LAYOUT } from "@/lib/family-tree/layout";
import { planFamilyTreeRepair } from "@/lib/family-tree/repair";
import {
  planFamilyTreeScaffold,
  type ScaffoldGraph,
  type ScaffoldGraphEdge,
} from "@/lib/family-tree/scaffold";
import { assignGenerationRanks } from "@/lib/family-tree/types";

/**
 * Acceptance: addCousin(Kat, Scott) must write subject-side parentUnion and
 * place Scott on Kathy’s generation/side — not Jeff’s parent row.
 */

type Laid = {
  id: string;
  label: string;
  x: number;
  y: number;
  generation: number;
};

function applyPlan(
  graph: ScaffoldGraph,
  plan: ReturnType<typeof planFamilyTreeScaffold>,
): ScaffoldGraph {
  const nodes = [
    ...graph.nodes,
    ...plan.nodes.map((n) => ({
      id: n.key,
      label: n.label,
      personId: null as string | null,
    })),
  ];
  const relationships: ScaffoldGraphEdge[] = [
    ...graph.relationships,
    ...plan.relationships.map((r) => ({
      fromNodeId: r.fromKey,
      toNodeId: r.toKey,
      type: r.type,
    })),
  ];
  return { nodes, relationships };
}

function layoutOf(graph: ScaffoldGraph) {
  return computeFamilyTreeLayout(
    graph.nodes.map((n) => ({ id: n.id, label: n.label })),
    graph.relationships.map((r) => ({
      fromNodeId: r.fromNodeId,
      toNodeId: r.toNodeId,
      type: r.type,
    })),
  );
}

function mid(n: { x: number }) {
  return n.x + TREE_LAYOUT.nodeWidth / 2;
}

describe("addCousin(Kat, Scott) structural placement", () => {
  const base: ScaffoldGraph = {
    nodes: [
      { id: "diane", label: "Diane Barbour", personId: null },
      { id: "frank", label: "Frank Barbour", personId: null },
      { id: "paul", label: "Paul K Roberts", personId: null },
      { id: "helene", label: "Helene Roberts", personId: null },
      { id: "jeff", label: "Jeff", personId: null },
      { id: "kathy", label: "Kathy", personId: null },
      { id: "donna", label: "Donna", personId: null },
      { id: "scott", label: "Scott", personId: null },
    ],
    relationships: [
      { fromNodeId: "diane", toNodeId: "frank", type: "partner_of" },
      { fromNodeId: "diane", toNodeId: "kathy", type: "parent_of" },
      { fromNodeId: "frank", toNodeId: "kathy", type: "parent_of" },
      { fromNodeId: "diane", toNodeId: "donna", type: "parent_of" },
      { fromNodeId: "frank", toNodeId: "donna", type: "parent_of" },
      { fromNodeId: "paul", toNodeId: "helene", type: "partner_of" },
      { fromNodeId: "paul", toNodeId: "jeff", type: "parent_of" },
      { fromNodeId: "helene", toNodeId: "jeff", type: "parent_of" },
      { fromNodeId: "jeff", toNodeId: "kathy", type: "partner_of" },
      { fromNodeId: "kathy", toNodeId: "donna", type: "sibling_of" },
    ],
  };

  function assertScottOnKathySide(graph: ScaffoldGraph) {
    const withCousin: ScaffoldGraph = {
      ...graph,
      relationships: [
        ...graph.relationships,
        // Lexicographic canonicalize would put scott before kathy — subject must stay Kathy.
        { fromNodeId: "kathy", toNodeId: "scott", type: "cousin_of" },
      ],
    };

    expect(
      cousinsLinkedOnSubjectLineage(withCousin, "kathy", "scott"),
    ).toBe(true);

    const ranks = assignGenerationRanks(
      withCousin.nodes.map((n) => n.id),
      withCousin.relationships
        .filter((e) => e.type === "parent_of")
        .map((e) => ({
          fromNodeId: e.fromNodeId,
          toNodeId: e.toNodeId,
        })),
      {
        partnerPairs: withCousin.relationships
          .filter((e) => e.type === "partner_of")
          .map((e) => [e.fromNodeId, e.toNodeId] as const),
        siblingPairs: withCousin.relationships
          .filter((e) => e.type === "sibling_of")
          .map((e) => [e.fromNodeId, e.toNodeId] as const),
        cousinPairs: [["kathy", "scott"]],
      },
    );
    expect(ranks.scott).toBe(ranks.kathy);
    expect(ranks.scott).toBeGreaterThan(ranks.diane);
    expect(ranks.scott).toBeGreaterThan(ranks.paul);

    const layout = layoutOf(withCousin);
    const by = Object.fromEntries(
      layout.nodes.map((n) => [n.id, n]),
    ) as Record<string, Laid>;

    expect(by.scott.generation).toBe(by.kathy.generation);
    expect(by.scott.y).toBe(by.kathy.y);

    // Same flank as Donna (Kathy’s side), not Jeff’s.
    expect(Math.abs(mid(by.scott) - mid(by.kathy))).toBeLessThan(
      Math.abs(mid(by.scott) - mid(by.jeff)),
    );
    const kathyLeft = by.kathy.x < by.jeff.x;
    if (kathyLeft) {
      expect(by.scott.x).toBeLessThan(by.kathy.x);
    } else {
      expect(by.scott.x).toBeGreaterThan(by.kathy.x);
    }

    const kathyParentsMid = (mid(by.diane) + mid(by.frank)) / 2;
    const jeffParentsMid = (mid(by.paul) + mid(by.helene)) / 2;
    expect(Math.abs(mid(by.scott) - kathyParentsMid)).toBeLessThan(
      Math.abs(mid(by.scott) - jeffParentsMid),
    );

    // Parent bridge nodes exist on Kathy’s side (sibling to Diane or Frank).
    const scottParents = withCousin.relationships
      .filter((e) => e.type === "parent_of" && e.toNodeId === "scott")
      .map((e) => e.fromNodeId);
    expect(scottParents.length).toBeGreaterThanOrEqual(1);
    const bridged = withCousin.relationships.some(
      (e) =>
        e.type === "sibling_of" &&
        ((scottParents.includes(e.fromNodeId) &&
          (e.toNodeId === "diane" || e.toNodeId === "frank")) ||
          (scottParents.includes(e.toNodeId) &&
            (e.fromNodeId === "diane" || e.fromNodeId === "frank"))),
    );
    expect(bridged).toBe(true);
    expect(
      withCousin.relationships.some(
        (e) =>
          e.type === "sibling_of" &&
          ((scottParents.includes(e.fromNodeId) &&
            (e.toNodeId === "paul" || e.toNodeId === "helene")) ||
            (scottParents.includes(e.toNodeId) &&
              (e.fromNodeId === "paul" || e.fromNodeId === "helene"))),
      ),
    ).toBe(false);
  }

  it("scaffolds aunt/uncle parentUnion on Kathy’s bloodline even when ids sort Scott first", () => {
    const plan = planFamilyTreeScaffold(base, {
      // Canonical storage order (scott < kathy) — subject must remain Kathy.
      fromNodeId: "scott",
      toNodeId: "kathy",
      type: "cousin_of",
      cousinSide: "maternal",
      cousinSubjectId: "kathy",
    });

    expect(plan.nodes.length).toBeGreaterThanOrEqual(2);
    expect(plan.relationships.some((r) => r.type === "sibling_of")).toBe(true);

    const graph = applyPlan(base, plan);
    // Primary cousin edge (as stored undirected).
    assertScottOnKathySide(graph);

    const status = analyzeCousinLineage(graph, "kathy", "scott", "kathy");
    expect(status.ok).toBe(true);
    expect(status.subjectId).toBe("kathy");
    expect(["diane", "frank"]).toContain(status.subjectBridgeParentId);
  });

  it("addCousin(Kathy, Scott) from subject id order still bridges Kathy’s mom", () => {
    const plan = planFamilyTreeScaffold(base, {
      fromNodeId: "kathy",
      toNodeId: "scott",
      type: "cousin_of",
      cousinSide: "maternal",
      cousinSubjectId: "kathy",
    });
    const graph = applyPlan(base, plan);
    assertScottOnKathySide(graph);
  });

  it("repair plans ensure_cousin_lineage when Scott has cousin_of but no subject bridge", () => {
    const plan = planFamilyTreeRepair({
      nodes: base.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        personId: n.personId,
        notes: null,
      })),
      relationships: [
        ...base.relationships.map((r, i) => ({
          id: `e${i}`,
          fromNodeId: r.fromNodeId,
          toNodeId: r.toNodeId,
          type: r.type,
        })),
        {
          id: "cousin",
          fromNodeId: "kathy",
          toNodeId: "scott",
          type: "cousin_of",
        },
      ],
    });

    expect(
      plan.ops.some(
        (o) =>
          o.op === "ensure_cousin_lineage" &&
          o.subjectId === "kathy" &&
          o.cousinId === "scott",
      ),
    ).toBe(true);
  });

  it("connect Who=Scott To=Kathy still scaffolds on Kathy’s bloodline via preferCousinSubjectId", () => {
    const subjectId = preferCousinSubjectId(base, "scott", "kathy");
    expect(subjectId).toBe("kathy");

    const plan = planFamilyTreeScaffold(base, {
      fromNodeId: "scott",
      toNodeId: "kathy",
      type: "cousin_of",
      cousinSide: "maternal",
      cousinSubjectId: subjectId,
    });
    const graph = applyPlan(base, plan);
    assertScottOnKathySide(graph);
  });

  it("after addCousin writes, Scott matches Kat generation, has parents, and sits on Kat’s flank", () => {
    const plan = planFamilyTreeScaffold(base, {
      fromNodeId: "kathy",
      toNodeId: "scott",
      type: "cousin_of",
      cousinSide: "maternal",
      cousinSubjectId: "kathy",
    });
    const graph = applyPlan(base, plan);
    const withCousin: ScaffoldGraph = {
      ...graph,
      relationships: [
        ...graph.relationships,
        { fromNodeId: "kathy", toNodeId: "scott", type: "cousin_of" },
      ],
    };

    expect(
      withCousin.relationships.some(
        (e) =>
          e.type === "cousin_of" &&
          ((e.fromNodeId === "kathy" && e.toNodeId === "scott") ||
            (e.fromNodeId === "scott" && e.toNodeId === "kathy")),
      ),
    ).toBe(true);

    const scottParents = withCousin.relationships
      .filter((e) => e.type === "parent_of" && e.toNodeId === "scott")
      .map((e) => e.fromNodeId);
    expect(scottParents.length).toBeGreaterThanOrEqual(1);

    const ranks = assignGenerationRanks(
      withCousin.nodes.map((n) => n.id),
      withCousin.relationships
        .filter((e) => e.type === "parent_of")
        .map((e) => ({
          fromNodeId: e.fromNodeId,
          toNodeId: e.toNodeId,
        })),
      {
        partnerPairs: withCousin.relationships
          .filter((e) => e.type === "partner_of")
          .map((e) => [e.fromNodeId, e.toNodeId] as const),
        siblingPairs: withCousin.relationships
          .filter((e) => e.type === "sibling_of")
          .map((e) => [e.fromNodeId, e.toNodeId] as const),
        cousinPairs: [["kathy", "scott"]],
      },
    );
    expect(ranks.scott).toBe(ranks.kathy);

    const layout = layoutOf(withCousin);
    const by = Object.fromEntries(
      layout.nodes.map((n) => [n.id, n]),
    ) as Record<string, Laid>;
    expect(by.scott.y).toBe(by.kathy.y);
    expect(Math.abs(mid(by.scott) - mid(by.kathy))).toBeLessThan(
      Math.abs(mid(by.scott) - mid(by.jeff)),
    );
  });
});
