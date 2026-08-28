import { describe, expect, it } from "vitest";
import type { GenealogyEngineCommand } from "@/lib/family-tree/engine";

describe("GenealogyEngineCommand shape", () => {
  it("covers the required command surface", () => {
    const commands: GenealogyEngineCommand[] = [
      { type: "addSpouse", personId: "a" },
      { type: "addParent", personId: "a" },
      { type: "addChild", personId: "a" },
      { type: "addChild", personId: "a", oneParentOnly: true },
      { type: "addSibling", personId: "a" },
      { type: "addCousin", personId: "a", side: "maternal" },
      {
        type: "addCousin",
        personId: "a",
        label: "Scott",
        parent1Label: "Mary",
        parent2Label: "Harvey",
        attachWhich: "parent1",
        attachToNodeId: "diane",
      },
      {
        type: "connect",
        fromNodeId: "a",
        toNodeId: "b",
        relationType: "cousin_of",
        cousinSide: "paternal",
      },
      { type: "placePerson", peopleId: "p1" },
      { type: "addPlaceholder", label: "Aunt" },
      { type: "linkPlaceholderToPerson", nodeId: "n1", peopleId: "p1" },
      { type: "renameNode", nodeId: "n1", label: "Jeff" },
      { type: "removeRelationship", edgeId: "e1" },
      { type: "deleteNode", nodeId: "n1" },
      { type: "undoScaffold", nodeIds: [], relationshipIds: [] },
      { type: "repairTree" },
      { type: "correctLayout" },
      { type: "clearNodeReview", nodeId: "n1" },
    ];
    expect(commands).toHaveLength(18);
    expect(new Set(commands.map((c) => c.type)).size).toBe(16);
  });
});
