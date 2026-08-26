import type {
  FamilyTreeGraph,
  FamilyTreeGraphNode,
  FamilyTreePersonPreview,
} from "@/lib/family-tree";
import type { FamilyTreeDerivedEdge } from "@/lib/family-tree/types";
import type { FamilyTreeRelationship } from "@/lib/db/schema";

export type SerializedFamilyTreePerson = FamilyTreePersonPreview;

export type SerializedFamilyTreeNode = Omit<
  FamilyTreeGraphNode,
  "createdAt" | "updatedAt"
> & {
  createdAt: string;
  updatedAt: string;
};

export type SerializedFamilyTreeRelationship = Omit<
  FamilyTreeRelationship,
  "createdAt" | "updatedAt"
> & {
  createdAt: string;
  updatedAt: string;
};

export type SerializedFamilyTreeGraph = {
  nodes: SerializedFamilyTreeNode[];
  relationships: SerializedFamilyTreeRelationship[];
  derived: FamilyTreeDerivedEdge[];
  generations: Record<string, number>;
  repair?: {
    applied: boolean;
    opsApplied: number;
    flaggedNodeIds: string[];
    message: string | null;
  } | null;
};

export function serializeFamilyTreeNode(
  node: FamilyTreeGraphNode,
): SerializedFamilyTreeNode {
  return {
    ...node,
    createdAt: node.createdAt.toISOString(),
    updatedAt: node.updatedAt.toISOString(),
  };
}

export function serializeFamilyTreeRelationship(
  rel: FamilyTreeRelationship,
): SerializedFamilyTreeRelationship {
  return {
    ...rel,
    createdAt: rel.createdAt.toISOString(),
    updatedAt: rel.updatedAt.toISOString(),
  };
}

export function serializeFamilyTreeGraph(
  graph: FamilyTreeGraph,
): SerializedFamilyTreeGraph {
  return {
    nodes: graph.nodes.map(serializeFamilyTreeNode),
    relationships: graph.relationships.map(serializeFamilyTreeRelationship),
    derived: graph.derived,
    generations: graph.generations,
    repair: graph.repair
      ? {
          applied: graph.repair.applied,
          opsApplied: graph.repair.opsApplied,
          flaggedNodeIds: graph.repair.flaggedNodeIds,
          message: graph.repair.message,
        }
      : null,
  };
}
