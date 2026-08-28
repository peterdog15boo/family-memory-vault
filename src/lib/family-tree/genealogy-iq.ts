/**
 * Genealogy IQ — pure helpers for safe, predictable family-tree edits.
 *
 * Rules (summary):
 * - Prefer attaching to existing people over inventing duplicates.
 * - Auto-link only when the relationship is obvious and safe.
 * - Never imply that existing people should be deleted or detached.
 */

import type { FamilyTreeRelationType } from "@/lib/db/schema";

export type GenealogyEdge = {
  fromNodeId: string;
  toNodeId: string;
  type: FamilyTreeRelationType;
};

/** Spouse node ids for a tree member (undirected partner_of). */
export function spouseIdsOf(
  relationships: readonly GenealogyEdge[],
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

export function hasPartnerLink(
  relationships: readonly GenealogyEdge[],
  a: string,
  b: string,
): boolean {
  return spouseIdsOf(relationships, a).includes(b);
}

/** True when `parentId` already has a parent_of edge to `childId`. */
export function isParentOfChild(
  relationships: readonly GenealogyEdge[],
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

/** Other parents already linked to `childId` (excludes `parentId`). */
export function otherParentsOfChild(
  relationships: readonly GenealogyEdge[],
  childId: string,
  parentId: string,
): string[] {
  return relationships
    .filter(
      (r) =>
        r.type === "parent_of" &&
        r.toNodeId === childId &&
        r.fromNodeId !== parentId,
    )
    .map((r) => r.fromNodeId);
}

/** Children of `parentId` via parent_of. */
export function childIdsOf(
  relationships: readonly GenealogyEdge[],
  parentId: string,
): string[] {
  const out: string[] = [];
  for (const r of relationships) {
    if (r.type === "parent_of" && r.fromNodeId === parentId) {
      out.push(r.toNodeId);
    }
  }
  return out;
}

/**
 * When `newSpouseId` is linked as partner of `parentId`, which of parentId's
 * children should also get parent_of from the new spouse?
 *
 * Default product rule: a new spouse of a parent is also a parent of that
 * person's existing children — unless the spouse already has separate kids
 * of their own (blended families are not auto-merged).
 */
export function missingChildrenForNewSpouse(
  relationships: readonly GenealogyEdge[],
  parentId: string,
  newSpouseId: string,
  excludeChildIds: readonly string[] = [],
): string[] {
  if (parentId === newSpouseId) return [];
  const exclude = new Set(excludeChildIds);

  const spouseOwnKids = childIdsOf(relationships, newSpouseId).filter(
    (kid) => !isParentOfChild(relationships, parentId, kid),
  );
  if (spouseOwnKids.length > 0) return [];

  return childIdsOf(relationships, parentId).filter(
    (kid) =>
      kid !== newSpouseId &&
      !exclude.has(kid) &&
      !isParentOfChild(relationships, newSpouseId, kid),
  );
}

/**
 * True when the child has a parent whose spouse is not also linked as a parent
 * (remarriage / step-family). Used for an optional UI “step” hint only.
 */
export function showsStepChildHint(
  relationships: readonly GenealogyEdge[],
  childId: string,
): boolean {
  const parents = relationships
    .filter((r) => r.type === "parent_of" && r.toNodeId === childId)
    .map((r) => r.fromNodeId);
  if (parents.length === 0) return false;
  for (const parentId of parents) {
    for (const spouseId of spouseIdsOf(relationships, parentId)) {
      if (!isParentOfChild(relationships, spouseId, childId)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Spouses of `parentId` who should also become parents of `childId`
 * (already-linked spouses are skipped).
 */
export function missingCoParentSpouseIds(
  relationships: readonly GenealogyEdge[],
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
  relationships: readonly GenealogyEdge[],
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

/**
 * Safe auto-spouse: two co-parents of the same child may be linked as spouses
 * only when neither already has a competing spouse.
 */
export function canAutoSpouseCoParents(
  relationships: readonly GenealogyEdge[],
  parentA: string,
  parentB: string,
): boolean {
  if (parentA === parentB) return false;
  if (hasPartnerLink(relationships, parentA, parentB)) return false;

  const spousesA = spouseIdsOf(relationships, parentA);
  const spousesB = spouseIdsOf(relationships, parentB);
  // Competing spouse = already partnered with someone else.
  if (spousesA.some((id) => id !== parentB)) return false;
  if (spousesB.some((id) => id !== parentA)) return false;
  return true;
}

/**
 * After adding `newParentId` as parent of `childId`, which existing parents
 * should be auto-linked as spouses of the new parent?
 */
export function coParentsToAutoSpouse(
  relationships: readonly GenealogyEdge[],
  newParentId: string,
  childId: string,
): string[] {
  return otherParentsOfChild(relationships, childId, newParentId).filter(
    (otherId) => canAutoSpouseCoParents(relationships, newParentId, otherId),
  );
}

/**
 * Soft layout pairing: co-parents who share a child and have no spouse yet
 * should sit side-by-side like a couple (without inventing a DB edge).
 */
export function inferredCoParentPairs(
  relationships: readonly GenealogyEdge[],
): Array<readonly [string, string]> {
  const parentsByChild = new Map<string, string[]>();
  for (const r of relationships) {
    if (r.type !== "parent_of") continue;
    const list = parentsByChild.get(r.toNodeId) ?? [];
    list.push(r.fromNodeId);
    parentsByChild.set(r.toNodeId, list);
  }

  const pairs: Array<readonly [string, string]> = [];
  const seen = new Set<string>();
  for (const parents of parentsByChild.values()) {
    if (parents.length !== 2) continue;
    const [a, b] = parents;
    if (!a || !b) continue;
    if (!canAutoSpouseCoParents(relationships, a, b)) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push(a < b ? [a, b] : [b, a]);
  }
  return pairs;
}

export type GenealogyIqNotice = {
  kind: "spouse_link" | "co_parent_link" | "sibling_parent_link";
  message: string;
};

export function spouseLinkNotice(labelA: string, labelB: string): GenealogyIqNotice {
  return {
    kind: "spouse_link",
    message: `Linked ${labelA} and ${labelB} as spouses.`,
  };
}

export function coParentLinkNotice(
  spouseLabel: string,
  childLabel: string,
): GenealogyIqNotice {
  return {
    kind: "co_parent_link",
    message: `Also linked ${spouseLabel} as a parent of ${childLabel}.`,
  };
}
