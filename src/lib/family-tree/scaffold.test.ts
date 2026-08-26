import { describe, expect, it } from "vitest";
import {
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
  it("creates two placeholder parents + sibling bridge for cousins", () => {
    const plan = planFamilyTreeScaffold(graph(["alex", "casey"]), {
      fromNodeId: "alex",
      toNodeId: "casey",
      type: "cousin_of",
    });

    expect(plan.nodes).toHaveLength(2);
    expect(plan.nodes.map((n) => n.label).sort()).toEqual(["Dad", "Mom"]);
    expect(plan.relationships.filter((r) => r.type === "parent_of")).toHaveLength(
      2,
    );
    expect(plan.relationships.some((r) => r.type === "sibling_of")).toBe(true);
    expect(plan.message).toMatch(/placeholder parents/i);
  });

  it("reuses an existing parent and only creates the missing side", () => {
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

    expect(plan.nodes).toHaveLength(1);
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

    // Two new parents (Kathy + Scott) — never attach Scott through Jeff's dad.
    expect(plan.nodes.length).toBeGreaterThanOrEqual(2);
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
    expect(plan.nodes[0]?.label).toBe("Partner");
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
