/**
 * Sibling ↔ shared parent union helpers.
 * If A is sibling_of B and B has parents while A has none, A joins that union.
 */

import type { FamilyTreeRelationType } from "@/lib/db/schema";

export type SiblingParentEdge = {
  fromNodeId: string;
  toNodeId: string;
  type: FamilyTreeRelationType;
};

function parentsOf(edges: SiblingParentEdge[], childId: string): string[] {
  return [
    ...new Set(
      edges
        .filter((e) => e.type === "parent_of" && e.toNodeId === childId)
        .map((e) => e.fromNodeId),
    ),
  ].sort();
}

function hasParentLink(
  edges: SiblingParentEdge[],
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
 * Missing parent_of edges so siblings share a parent union.
 * Only copies when one sibling has parents and the other has none
 * (does not merge two different existing parent sets).
 */
export function missingSharedSiblingParentLinks(
  edges: SiblingParentEdge[],
  a: string,
  b: string,
): Array<{ parentId: string; childId: string }> {
  if (a === b) return [];
  const parentsA = parentsOf(edges, a);
  const parentsB = parentsOf(edges, b);

  const out: Array<{ parentId: string; childId: string }> = [];
  if (parentsA.length === 0 && parentsB.length > 0) {
    for (const parentId of parentsB) {
      if (!hasParentLink(edges, parentId, a)) {
        out.push({ parentId, childId: a });
      }
    }
  } else if (parentsB.length === 0 && parentsA.length > 0) {
    for (const parentId of parentsA) {
      if (!hasParentLink(edges, parentId, b)) {
        out.push({ parentId, childId: b });
      }
    }
  }
  return out;
}
