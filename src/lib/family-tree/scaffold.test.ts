import { describe, expect, it } from "vitest";
import {
  findMislinkedCoParentSiblingEdges,
  planFamilyTreeScaffold,
  type ScaffoldGraph,
} from "@/lib/family-tree/scaffold";

function graph(
  nodeIds: string[],
  relationships: ScaffoldGraph["relationships"] = [],
): ScaffoldGraph {
  return {
    nodes: nodeIds.map((id) => ({
      id,
      label: id,
      personId: id.startsWith("real-") ? id : null,
    })),
    relationships,
  };
}

describe("planFamilyTreeScaffold", () => {
  it("creates Mom/Dad spouse pairs for each cousin + sibling bridge across families", () => {
    const plan = planFamilyTreeScaffold(graph(["alex", "casey"]), {
      fromNodeId: "alex",
      toNodeId: "casey",
      type: "cousin_of",
    });

    expect(plan.nodes).toHaveLength(4);
    expect(plan.nodes.map((n) => n.label).sort()).toEqual([
      "Dad",
      "Dad",
      "Mom",
      "Mom",
    ]);

    const parentLinks = plan.relationships.filter((r) => r.type === "parent_of");
    expect(parentLinks).toHaveLength(4);
    expect(
      parentLinks.filter(
        (r) => r.toKey === "alex" || r.fromKey === "alex",
      ),
    ).toHaveLength(2);
    expect(
      parentLinks.filter(
        (r) => r.toKey === "casey" || r.fromKey === "casey",
      ),
    ).toHaveLength(2);

    const spouseLinks = plan.relationships.filter((r) => r.type === "partner_of");
    expect(spouseLinks).toHaveLength(2);

    // Sibling bridge only between the two families — not between Mom/Dad of one child.
    const siblingLinks = plan.relationships.filter((r) => r.type === "sibling_of");
    expect(siblingLinks).toHaveLength(1);
    expect(plan.message).toMatch(/placeholder parents/i);
  });

  it("does not mark a new parent pair as siblings of each other", () => {
    const plan = planFamilyTreeScaffold(graph(["scott", "cousin"]), {
      fromNodeId: "scott",
      toNodeId: "cousin",
      type: "cousin_of",
    });

    const scottParents = plan.relationships
      .filter((r) => r.type === "parent_of" && r.toKey === "scott")
      .map((r) => r.fromKey);
    expect(scottParents).toHaveLength(2);

    expect(
      plan.relationships.some(
        (r) =>
          r.type === "sibling_of" &&
          scottParents.includes(r.fromKey) &&
          scottParents.includes(r.toKey),
      ),
    ).toBe(false);

    expect(
      plan.relationships.some(
        (r) =>
          r.type === "partner_of" &&
          scottParents.includes(r.fromKey) &&
          scottParents.includes(r.toKey),
      ),
    ).toBe(true);
  });

  it("reuses an existing parent and only creates the missing side couple", () => {
    const plan = planFamilyTreeScaffold(
      graph(
        ["alex", "casey", "mom"],
        [{ fromNodeId: "mom", toNodeId: "alex", type: "parent_of" }],
      ),
      {
        fromNodeId: "alex",
        toNodeId: "casey",
        type: "cousin_of",
      },
    );

    expect(plan.nodes).toHaveLength(2);
    expect(plan.nodes.map((n) => n.label).sort()).toEqual(["Dad", "Mom"]);
    expect(plan.relationships.some((r) => r.type === "partner_of")).toBe(true);
    expect(plan.relationships.some((r) => r.type === "sibling_of")).toBe(true);
    expect(
      plan.relationships.some(
        (r) =>
          r.type === "parent_of" &&
          (r.toKey === "casey" || r.fromKey === "casey"),
      ),
    ).toBe(true);
  });

  it("does not reuse a partner's parents when scaffolding a cousin", () => {
    const plan = planFamilyTreeScaffold(
      graph(
        ["jeff", "kathy", "jeff-dad", "scott"],
        [
          { fromNodeId: "jeff", toNodeId: "kathy", type: "partner_of" },
          { fromNodeId: "jeff-dad", toNodeId: "jeff", type: "parent_of" },
        ],
      ),
      {
        fromNodeId: "kathy",
        toNodeId: "scott",
        type: "cousin_of",
      },
    );

    // New parents for Kathy + Scott — never attach Scott through Jeff's dad.
    expect(plan.nodes.length).toBeGreaterThanOrEqual(4);
    const parentLinks = plan.relationships.filter((r) => r.type === "parent_of");
    expect(
      parentLinks.some(
        (r) =>
          (r.fromKey === "jeff-dad" || r.toKey === "jeff-dad") &&
          (r.fromKey === "scott" ||
            r.toKey === "scott" ||
            r.fromKey === "kathy" ||
            r.toKey === "kathy"),
      ),
    ).toBe(false);
    expect(
      plan.relationships.some(
        (r) =>
          r.type === "sibling_of" &&
          (r.fromKey === "jeff-dad" || r.toKey === "jeff-dad"),
      ),
    ).toBe(false);
  });

  it("does nothing when cousin parents are already siblings", () => {
    const plan = planFamilyTreeScaffold(
      graph(
        ["alex", "casey", "p1", "p2"],
        [
          { fromNodeId: "p1", toNodeId: "alex", type: "parent_of" },
          { fromNodeId: "p2", toNodeId: "casey", type: "parent_of" },
          { fromNodeId: "p1", toNodeId: "p2", type: "sibling_of" },
        ],
      ),
      {
        fromNodeId: "alex",
        toNodeId: "casey",
        type: "cousin_of",
      },
    );

    expect(plan.nodes).toHaveLength(0);
    expect(plan.relationships).toHaveLength(0);
    expect(plan.message).toBeNull();
  });

  it("scaffolds niece via placeholder parent sibling of aunt", () => {
    const plan = planFamilyTreeScaffold(graph(["niece", "aunt"]), {
      fromNodeId: "niece",
      toNodeId: "aunt",
      type: "niece_of",
    });

    expect(plan.nodes).toHaveLength(1);
    expect(plan.nodes[0]?.label).toBe("Parent");
    expect(plan.relationships.some((r) => r.type === "parent_of")).toBe(true);
    expect(plan.relationships.some((r) => r.type === "sibling_of")).toBe(true);
    expect(plan.message).toMatch(/niece/i);
  });

  it("reuses aunt sibling as niece parent when present", () => {
    const plan = planFamilyTreeScaffold(
      graph(
        ["niece", "aunt", "sib"],
        [{ fromNodeId: "aunt", toNodeId: "sib", type: "sibling_of" }],
      ),
      {
        fromNodeId: "niece",
        toNodeId: "aunt",
        type: "niece_of",
      },
    );

    expect(plan.nodes).toHaveLength(0);
    expect(plan.relationships).toEqual([
      { fromKey: "sib", toKey: "niece", type: "parent_of" },
    ]);
  });

  it("scaffolds sister-in-law with partner bridge", () => {
    const plan = planFamilyTreeScaffold(graph(["ava", "ben"]), {
      fromNodeId: "ava",
      toNodeId: "ben",
      type: "sister_in_law_of",
    });

    expect(plan.nodes).toHaveLength(1);
    expect(plan.nodes[0]?.label).toBe("Spouse");
    expect(plan.relationships.some((r) => r.type === "partner_of")).toBe(true);
    expect(plan.relationships.some((r) => r.type === "sibling_of")).toBe(true);
    expect(plan.message).toMatch(/sister-in-law/i);
  });

  it("skips scaffold for parent_of", () => {
    const plan = planFamilyTreeScaffold(graph(["p", "c"]), {
      fromNodeId: "p",
      toNodeId: "c",
      type: "parent_of",
    });
    expect(plan.nodes).toHaveLength(0);
    expect(plan.message).toBeNull();
  });
});

describe("findMislinkedCoParentSiblingEdges", () => {
  it("flags siblings who share a child as a mislinked parental couple", () => {
    const bad = findMislinkedCoParentSiblingEdges([
      { id: "e1", fromNodeId: "mom", toNodeId: "scott", type: "parent_of" },
      { id: "e2", fromNodeId: "dad", toNodeId: "scott", type: "parent_of" },
      { id: "e3", fromNodeId: "dad", toNodeId: "mom", type: "sibling_of" },
    ]);
    expect(bad).toEqual([
      { id: "e3", fromNodeId: "dad", toNodeId: "mom" },
    ]);
  });

  it("does not flag a valid cousin parent sibling bridge", () => {
    const bad = findMislinkedCoParentSiblingEdges([
      { id: "e1", fromNodeId: "mom", toNodeId: "alex", type: "parent_of" },
      { id: "e2", fromNodeId: "uncle", toNodeId: "casey", type: "parent_of" },
      { id: "e3", fromNodeId: "mom", toNodeId: "uncle", type: "sibling_of" },
    ]);
    expect(bad).toHaveLength(0);
  });
});
