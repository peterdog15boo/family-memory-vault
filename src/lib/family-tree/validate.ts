/**
 * Family Tree relationship integrity — block ancestry cycles and
 * generationally impossible links (server-side).
 */

import type { FamilyTreeRelationType } from "@/lib/db/schema";
import { canonicalizeRelationshipEndpoints } from "@/lib/family-tree/relations";

export const FAMILY_TREE_CIRCULAR_RELATIONSHIP_MESSAGE =
  "That relationship would create a circular family connection.";

export type AncestryEdge = {
  fromNodeId: string;
  toNodeId: string;
  type: FamilyTreeRelationType;
};

/** parent_of edges only: parent → child adjacency. */
export function buildChildrenByParent(
  edges: AncestryEdge[],
): Map<string, Set<string>> {
  const childrenByParent = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.type !== "parent_of") continue;
    if (edge.fromNodeId === edge.toNodeId) continue;
    const kids = childrenByParent.get(edge.fromNodeId) ?? new Set<string>();
    kids.add(edge.toNodeId);
    childrenByParent.set(edge.fromNodeId, kids);
  }
  return childrenByParent;
}

/**
 * True when `ancestorId` can reach `descendantId` by walking parent → child links.
 */
export function isAncestorOf(
  edges: AncestryEdge[],
  ancestorId: string,
  descendantId: string,
): boolean {
  if (ancestorId === descendantId) return false;
  const childrenByParent = buildChildrenByParent(edges);
  const stack = [ancestorId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    const kids = childrenByParent.get(current);
    if (!kids) continue;
    for (const child of kids) {
      if (child === descendantId) return true;
      if (!seen.has(child)) stack.push(child);
    }
  }
  return false;
}

/**
 * True if adding parent→child would introduce a directed cycle in the
 * parent_of graph (including mutual parent/child).
 */
export function wouldCreateParentCycle(
  edges: AncestryEdge[],
  parentId: string,
  childId: string,
): boolean {
  if (parentId === childId) return true;
  // Child is already an ancestor of parent ⇒ adding parent→child closes a loop.
  return isAncestorOf(edges, childId, parentId);
}

function hasParentLink(
  edges: AncestryEdge[],
  parentId: string,
  childId: string,
): boolean {
  return edges.some(
    (e) =>
      e.type === "parent_of" &&
      e.fromNodeId === parentId &&
      e.toNodeId === childId,
  );
}

/**
 * Whether two nodes already sit on the same ancestry line (either direction).
 */
export function areOnSameAncestryLine(
  edges: AncestryEdge[],
  a: string,
  b: string,
): boolean {
  if (a === b) return true;
  return isAncestorOf(edges, a, b) || isAncestorOf(edges, b, a);
}

export type RelationshipValidationResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Validate a proposed relationship against existing edges.
 * Does not mutate; caller must not persist when ok is false.
 */
export function validateFamilyTreeRelationship(
  existingEdges: AncestryEdge[],
  input: {
    fromNodeId: string;
    toNodeId: string;
    type: FamilyTreeRelationType;
  },
): RelationshipValidationResult {
  const endpoints = canonicalizeRelationshipEndpoints(
    input.type,
    input.fromNodeId,
    input.toNodeId,
  );
  const fromNodeId = endpoints.fromNodeId;
  const toNodeId = endpoints.toNodeId;
  const type = input.type;

  if (fromNodeId === toNodeId) {
    return { ok: false, message: FAMILY_TREE_CIRCULAR_RELATIONSHIP_MESSAGE };
  }

  switch (type) {
    case "parent_of": {
      // from = parent, to = child
      if (hasParentLink(existingEdges, toNodeId, fromNodeId)) {
        return {
          ok: false,
          message: FAMILY_TREE_CIRCULAR_RELATIONSHIP_MESSAGE,
        };
      }
      if (wouldCreateParentCycle(existingEdges, fromNodeId, toNodeId)) {
        return {
          ok: false,
          message: FAMILY_TREE_CIRCULAR_RELATIONSHIP_MESSAGE,
        };
      }
      return { ok: true };
    }

    case "partner_of":
    case "sibling_of": {
      // Partners/siblings cannot also be parent/child / ancestor-descendant.
      if (areOnSameAncestryLine(existingEdges, fromNodeId, toNodeId)) {
        return {
          ok: false,
          message: FAMILY_TREE_CIRCULAR_RELATIONSHIP_MESSAGE,
        };
      }
      return { ok: true };
    }

    case "cousin_of":
    case "sister_in_law_of":
    case "brother_in_law_of":
    case "other_relative_of": {
      // Same-generation style links should not cross an ancestry line.
      if (areOnSameAncestryLine(existingEdges, fromNodeId, toNodeId)) {
        return {
          ok: false,
          message: FAMILY_TREE_CIRCULAR_RELATIONSHIP_MESSAGE,
        };
      }
      return { ok: true };
    }

    case "niece_of":
    case "nephew_of": {
      // from = niece/nephew, to = aunt/uncle.
      // Niece must not be an ancestor of the aunt/uncle (impossible loop).
      // Aunt/uncle being ancestor of niece is also wrong for this edge type
      // (that would be grandparent territory via parent_of).
      if (areOnSameAncestryLine(existingEdges, fromNodeId, toNodeId)) {
        return {
          ok: false,
          message: FAMILY_TREE_CIRCULAR_RELATIONSHIP_MESSAGE,
        };
      }
      return { ok: true };
    }

    default:
      return { ok: true };
  }
}

/**
 * Validate a batch of new edges in order against a growing edge set
 * (used before applying scaffold + primary relationship).
 */
export function validateFamilyTreeRelationshipBatch(
  existingEdges: AncestryEdge[],
  proposed: AncestryEdge[],
): RelationshipValidationResult {
  const working: AncestryEdge[] = existingEdges.map((e) => ({ ...e }));
  for (const edge of proposed) {
    const result = validateFamilyTreeRelationship(working, edge);
    if (!result.ok) return result;
    const endpoints = canonicalizeRelationshipEndpoints(
      edge.type,
      edge.fromNodeId,
      edge.toNodeId,
    );
    working.push({
      fromNodeId: endpoints.fromNodeId,
      toNodeId: endpoints.toNodeId,
      type: edge.type,
    });
  }
  return { ok: true };
}
