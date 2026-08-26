/**
 * Helpers for treating spouses as co-parents when adding children.
 */

import type { FamilyTreeRelationType } from "@/lib/db/schema";

export type CoParentEdge = {
  fromNodeId: string;
  toNodeId: string;
  type: FamilyTreeRelationType;
};

/** Spouse node ids for a tree member (undirected partner_of). */
export function spouseIdsOf(
  relationships: readonly CoParentEdge[],
  nodeId: string,
): string[] {
  const out: string[] = [];
  for (const r of relationships) {
    if (r.type !== "partner_of") continue;
    if (r.fromNodeId === nodeId) out.push(r.toNodeId);
    else if (r.toNodeId === nodeId) out.push(r.fromNodeId);
  }
  return out;
}

/** True when `parentId` already has a parent_of edge to `childId`. */
export function isParentOfChild(
  relationships: readonly CoParentEdge[],
  parentId: string,
  childId: string,
): boolean {
  return relationships.some(
    (r) =>
      r.type === "parent_of" &&
      r.fromNodeId === parentId &&
      r.toNodeId === childId,
  );
}

/**
 * Spouses of `parentId` who should also become parents of `childId`
 * (already-linked spouses are skipped).
 */
export function missingCoParentSpouseIds(
  relationships: readonly CoParentEdge[],
  parentId: string,
  childId: string,
): string[] {
  if (parentId === childId) return [];
  return spouseIdsOf(relationships, parentId).filter(
    (spouseId) =>
      spouseId !== childId &&
      !isParentOfChild(relationships, spouseId, childId),
  );
}

/**
 * When filling a missing parent for `childId`, prefer an existing spouse of
 * a current parent instead of inventing a new placeholder.
 */
export function preferredExistingCoParentId(
  relationships: readonly CoParentEdge[],
  childId: string,
): string | null {
  const parentIds = relationships
    .filter((r) => r.type === "parent_of" && r.toNodeId === childId)
    .map((r) => r.fromNodeId);

  for (const parentId of parentIds) {
    for (const spouseId of spouseIdsOf(relationships, parentId)) {
      if (!isParentOfChild(relationships, spouseId, childId)) {
        return spouseId;
      }
    }
  }
  return null;
}
