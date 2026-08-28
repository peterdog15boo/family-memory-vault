/**
 * Family-tree graph helpers — derivation + generation ranks.
 * Stored relation vocabulary lives in `./relations`.
 */

import type { FamilyTreeRelationType } from "@/lib/db/schema";

export {
  canonicalizeRelationshipEndpoints,
  isFamilyTreeRelationType,
  FAMILY_TREE_STORED_RELATION_TYPES,
} from "@/lib/family-tree/relations";

/** Derived edge types computed from parent chains (not stored). */
export const FAMILY_TREE_DERIVED_RELATION_TYPES = [
  "grandparent_of",
  "grandchild_of",
  "sibling_of",
] as const;

export type FamilyTreeDerivedRelationType =
  (typeof FAMILY_TREE_DERIVED_RELATION_TYPES)[number];

export type FamilyTreeEdgeInput = {
  fromNodeId: string;
  toNodeId: string;
  type: FamilyTreeRelationType;
};

export type FamilyTreeDerivedEdge = {
  fromNodeId: string;
  toNodeId: string;
  type: FamilyTreeDerivedRelationType;
  /** True when inferred from shared parents (not an explicit sibling row). */
  inferred?: boolean;
};

/**
 * Infer grandparent / grandchild / sibling edges from stored parent_of links.
 * Explicit sibling_of rows are not re-emitted here (caller merges).
 * Never invents cousin / in-law / niece / nephew links.
 */
export function deriveFamilyTreeEdges(
  parentEdges: Array<{ fromNodeId: string; toNodeId: string }>,
): FamilyTreeDerivedEdge[] {
  const parentsByChild = new Map<string, Set<string>>();
  const childrenByParent = new Map<string, Set<string>>();

  for (const edge of parentEdges) {
    if (edge.fromNodeId === edge.toNodeId) continue;
    const parents = parentsByChild.get(edge.toNodeId) ?? new Set<string>();
    parents.add(edge.fromNodeId);
    parentsByChild.set(edge.toNodeId, parents);

    const children = childrenByParent.get(edge.fromNodeId) ?? new Set<string>();
    children.add(edge.toNodeId);
    childrenByParent.set(edge.fromNodeId, children);
  }

  const derived: FamilyTreeDerivedEdge[] = [];
  const seen = new Set<string>();

  function push(edge: FamilyTreeDerivedEdge) {
    const key = `${edge.type}:${edge.fromNodeId}->${edge.toNodeId}`;
    if (seen.has(key)) return;
    seen.add(key);
    derived.push(edge);
  }

  for (const [childId, parents] of parentsByChild) {
    for (const parentId of parents) {
      const grandparents = parentsByChild.get(parentId);
      if (!grandparents) continue;
      for (const gpId of grandparents) {
        if (gpId === childId || gpId === parentId) continue;
        push({
          fromNodeId: gpId,
          toNodeId: childId,
          type: "grandparent_of",
          inferred: true,
        });
        push({
          fromNodeId: childId,
          toNodeId: gpId,
          type: "grandchild_of",
          inferred: true,
        });
      }
    }
  }

  for (const [, children] of childrenByParent) {
    const ids = [...children];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i]!;
        const b = ids[j]!;
        const [fromNodeId, toNodeId] = a < b ? [a, b] : [b, a];
        push({
          fromNodeId,
          toNodeId,
          type: "sibling_of",
          inferred: true,
        });
      }
    }
  }

  return derived;
}

/**
 * Assign generation ranks for a simple visual layout.
 * Roots (no parents) are generation 0; children increase by 1.
 * Partners and explicit siblings are forced onto the same generation so
 * spouse-side and blood-side people do not drift onto the wrong row.
 */
export function assignGenerationRanks(
  nodeIds: string[],
  parentEdges: Array<{ fromNodeId: string; toNodeId: string }>,
  options?: {
    partnerPairs?: Array<readonly [string, string]>;
    siblingPairs?: Array<readonly [string, string]>;
    /** Cousins share a generation with their peer (never float on the parent row). */
    cousinPairs?: Array<readonly [string, string]>;
  },
): Record<string, number> {
  const idSet = new Set(nodeIds);
  const parentsByChild = new Map<string, string[]>();
  for (const edge of parentEdges) {
    if (!idSet.has(edge.fromNodeId) || !idSet.has(edge.toNodeId)) continue;
    const list = parentsByChild.get(edge.toNodeId) ?? [];
    list.push(edge.fromNodeId);
    parentsByChild.set(edge.toNodeId, list);
  }

  const ranks: Record<string, number> = {};
  const visiting = new Set<string>();

  function rankOf(id: string): number {
    if (ranks[id] != null) return ranks[id]!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const parents = parentsByChild.get(id) ?? [];
    const rank =
      parents.length === 0
        ? 0
        : Math.max(...parents.map((p) => rankOf(p))) + 1;
    visiting.delete(id);
    ranks[id] = rank;
    return rank;
  }

  for (const id of nodeIds) rankOf(id);

  // Union-find for same-generation constraints (partners + siblings + cousins).
  const parent = new Map<string, string>();
  function find(id: string): string {
    const p = parent.get(id) ?? id;
    if (p !== id) {
      const root = find(p);
      parent.set(id, root);
      return root;
    }
    return id;
  }
  function union(a: string, b: string) {
    if (!idSet.has(a) || !idSet.has(b)) return;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  for (const id of nodeIds) parent.set(id, id);
  for (const [a, b] of options?.partnerPairs ?? []) union(a, b);
  for (const [a, b] of options?.siblingPairs ?? []) union(a, b);
  for (const [a, b] of options?.cousinPairs ?? []) union(a, b);

  const componentMembers = new Map<string, string[]>();
  for (const id of nodeIds) {
    const root = find(id);
    const list = componentMembers.get(root) ?? [];
    list.push(id);
    componentMembers.set(root, list);
  }

  for (const members of componentMembers.values()) {
    const maxRank = Math.max(...members.map((id) => ranks[id] ?? 0));
    for (const id of members) ranks[id] = maxRank;
  }

  // Keep parent rows strictly above children after same-gen merges.
  let changed = true;
  let guard = 0;
  while (changed && guard < nodeIds.length * 4) {
    changed = false;
    guard += 1;
    for (const edge of parentEdges) {
      if (!idSet.has(edge.fromNodeId) || !idSet.has(edge.toNodeId)) continue;
      const parentRank = ranks[edge.fromNodeId] ?? 0;
      const childRank = ranks[edge.toNodeId] ?? 0;
      if (childRank <= parentRank) {
        const next = parentRank + 1;
        const childRoot = find(edge.toNodeId);
        for (const id of componentMembers.get(childRoot) ?? [edge.toNodeId]) {
          if ((ranks[id] ?? 0) < next) {
            ranks[id] = next;
            changed = true;
          }
        }
      }
    }
  }

  const values = nodeIds.map((id) => ranks[id] ?? 0);
  const min = values.length > 0 ? Math.min(...values) : 0;
  if (min !== 0) {
    for (const id of nodeIds) ranks[id] = (ranks[id] ?? 0) - min;
  }

  return ranks;
}
