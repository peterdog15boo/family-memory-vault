/**
 * Safe Family Tree debug export — nodes, edges, computed layout, inferred links.
 * No passwords, emails, media URLs, or auth secrets.
 */

import { bloodParentsOfSubject } from "@/lib/family-tree/cousin-lineage";
import { getFamilyTreeGraph } from "@/lib/family-tree/index";
import {
  computeFamilyTreeLayout,
  TREE_LAYOUT,
} from "@/lib/family-tree/layout";
import type { FamilyTreeRelationType } from "@/lib/db/schema";

export type FamilyTreeDebugExportOptions = {
  /** Skip auto-repair so the dump matches stored edges (default true). */
  skipRepair?: boolean;
};

export type FamilyTreeDebugPersonSummary = {
  id: string;
  label: string;
  personId: string | null;
  isPlaceholder: boolean;
  /** Generation from relationship ranking (0 = oldest ancestors in this dump). */
  inferredGeneration: number;
  /**
   * Relative to the focus couple: which spouse’s bloodline this person sits on.
   * `shared` = the couple themselves or joint children; `unattached` = no clear side.
   */
  inferredSide: "left" | "right" | "shared" | "unattached";
  parentIds: string[];
  spouseIds: string[];
  siblingIds: string[];
  childIds: string[];
  cousinIds: string[];
  /** Layout IQ coordinates when computable (not stored in DB). */
  layout: { x: number; y: number } | null;
};

export type FamilyTreeDebugEdge = {
  id: string;
  type: FamilyTreeRelationType;
  fromId: string;
  toId: string;
  createdAt: string;
};

export type FamilyTreeDebugUnion = {
  /** Stable key of the two parent ids. */
  id: string;
  spouseIds: [string, string] | [string];
  childIds: string[];
  /** Side relative to focus couple, if parents sit on one flank. */
  inferredSide: "left" | "right" | "shared" | "unattached";
};

export type FamilyTreeDebugExport = {
  exportedAt: string;
  treeOwnerUserId: string;
  focusCouple: {
    leftId: string;
    rightId: string;
    leftLabel: string;
    rightLabel: string;
  } | null;
  nodes: Array<{
    id: string;
    label: string;
    displayName: string;
    personId: string | null;
    isPlaceholder: boolean;
    notes: string | null;
    /** Stored generation is not a DB column; value is the inferred rank. */
    generation: number;
    lineageSide: null;
    layoutX: number | null;
    layoutY: number | null;
    createdAt: string;
    updatedAt: string;
  }>;
  relationships: FamilyTreeDebugEdge[];
  /** Derived-only edges (grandparent / inferred sibling), labeled as such. */
  derivedRelationships: Array<{
    type: string;
    fromId: string;
    toId: string;
    inferred?: boolean;
  }>;
  parentUnions: FamilyTreeDebugUnion[];
  personSummaries: FamilyTreeDebugPersonSummary[];
  meta: {
    nodeCount: number;
    relationshipCount: number;
    layoutComputed: boolean;
    skipRepair: boolean;
    note: string;
  };
};

type Rel = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  type: FamilyTreeRelationType;
  createdAt: Date;
};

function undirectedNeighbors(
  rels: Rel[],
  type: FamilyTreeRelationType,
  id: string,
): string[] {
  const out: string[] = [];
  for (const r of rels) {
    if (r.type !== type) continue;
    if (r.fromNodeId === id) out.push(r.toNodeId);
    else if (r.toNodeId === id) out.push(r.fromNodeId);
  }
  return [...new Set(out)].sort();
}

function parentsOf(rels: Rel[], childId: string): string[] {
  return [
    ...new Set(
      rels
        .filter((r) => r.type === "parent_of" && r.toNodeId === childId)
        .map((r) => r.fromNodeId),
    ),
  ].sort();
}

function childrenOf(rels: Rel[], parentId: string): string[] {
  return [
    ...new Set(
      rels
        .filter((r) => r.type === "parent_of" && r.fromNodeId === parentId)
        .map((r) => r.toNodeId),
    ),
  ].sort();
}

/**
 * Pick a focus couple for side inference: prefer a partnered pair that
 * bridges two bloodlines (both have parents), else most shared children,
 * oriented by blood-parent keys (stable left/right).
 */
export function inferFocusCouple(
  nodes: Array<{ id: string; label: string }>,
  rels: Rel[],
): { leftId: string; rightId: string } | null {
  const partners: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const r of rels) {
    if (r.type !== "partner_of") continue;
    const key =
      r.fromNodeId < r.toNodeId
        ? `${r.fromNodeId}|${r.toNodeId}`
        : `${r.toNodeId}|${r.fromNodeId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    partners.push([r.fromNodeId, r.toNodeId]);
  }
  if (partners.length === 0) return null;

  const sharedChildCount = (a: string, b: string) => {
    const ca = new Set(childrenOf(rels, a));
    return childrenOf(rels, b).filter((id) => ca.has(id)).length;
  };

  const coupleScore = (a: string, b: string) => {
    const parentsPresent =
      (parentsOf(rels, a).length > 0 ? 1 : 0) +
      (parentsOf(rels, b).length > 0 ? 1 : 0);
    // Bridging couples (in-laws joining) beat parent-generation unions.
    return parentsPresent * 100 + sharedChildCount(a, b);
  };

  partners.sort((p, q) => {
    const diff = coupleScore(q[0], q[1]) - coupleScore(p[0], p[1]);
    if (diff !== 0) return diff;
    return `${p[0]}|${p[1]}`.localeCompare(`${q[0]}|${q[1]}`);
  });

  const [a, b] = partners[0]!;
  const lineageGraph = {
    nodes: nodes.map((n) => ({ id: n.id, label: n.label })),
    relationships: rels.map((r) => ({
      fromNodeId: r.fromNodeId,
      toNodeId: r.toNodeId,
      type: r.type,
    })),
  };
  const parentsKey = (id: string) =>
    bloodParentsOfSubject(lineageGraph, id).slice().sort().join("+") ||
    parentsOf(rels, id).slice().sort().join("+") ||
    id;

  const leftId = parentsKey(a) <= parentsKey(b) ? a : b;
  const rightId = leftId === a ? b : a;
  return { leftId, rightId };
}

function belongsToSpouseBloodline(
  rels: Rel[],
  personId: string,
  spouseId: string,
): boolean {
  if (personId === spouseId) return true;
  const spouses = undirectedNeighbors(rels, "partner_of", personId);
  if (spouses.includes(spouseId)) return true;
  const siblings = undirectedNeighbors(rels, "sibling_of", personId);
  if (siblings.includes(spouseId)) return true;
  const cousins = undirectedNeighbors(rels, "cousin_of", personId);
  if (cousins.includes(spouseId)) return true;

  const spouseParents = parentsOf(rels, spouseId);
  const spouseParentSet = new Set(spouseParents);
  const personParents = parentsOf(rels, personId);
  if (personParents.some((p) => spouseParentSet.has(p))) return true;

  // Aunt/uncle of spouse: sibling of a spouse parent
  for (const sp of spouseParents) {
    if (undirectedNeighbors(rels, "sibling_of", sp).includes(personId)) {
      return true;
    }
  }

  // Aunt/uncle via shared generation: parent is sibling of spouse's parent
  for (const pp of personParents) {
    for (const sp of spouseParents) {
      const sibs = undirectedNeighbors(rels, "sibling_of", pp);
      if (sibs.includes(sp)) return true;
    }
  }

  // Ancestor of spouse
  {
    const stack = [...spouseParents];
    const visited = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      if (id === personId) return true;
      stack.push(...parentsOf(rels, id));
    }
  }

  // Descendant of spouse
  {
    const stack = [...childrenOf(rels, spouseId)];
    const visited = new Set<string>();
    while (stack.length) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      if (id === personId) return true;
      stack.push(...childrenOf(rels, id));
    }
  }

  // Parent of a cousin/sibling already on this bloodline (e.g. Scott’s mom)
  for (const childId of childrenOf(rels, personId)) {
    if (childId === spouseId) return true;
    if (undirectedNeighbors(rels, "cousin_of", spouseId).includes(childId)) {
      return true;
    }
    if (undirectedNeighbors(rels, "sibling_of", spouseId).includes(childId)) {
      return true;
    }
  }

  return false;
}

export function inferPersonSide(
  rels: Rel[],
  personId: string,
  focus: { leftId: string; rightId: string } | null,
): FamilyTreeDebugPersonSummary["inferredSide"] {
  if (!focus) return "unattached";
  const { leftId, rightId } = focus;
  if (personId === leftId || personId === rightId) return "shared";
  // Joint children of the focus couple
  const leftKids = new Set(childrenOf(rels, leftId));
  if (leftKids.has(personId) && childrenOf(rels, rightId).includes(personId)) {
    return "shared";
  }
  const onLeft = belongsToSpouseBloodline(rels, personId, leftId);
  const onRight = belongsToSpouseBloodline(rels, personId, rightId);
  if (onLeft && !onRight) return "left";
  if (onRight && !onLeft) return "right";
  if (onLeft && onRight) return "shared";
  return "unattached";
}

export function buildParentUnions(
  nodes: Array<{ id: string; label: string }>,
  rels: Rel[],
  focus: { leftId: string; rightId: string } | null,
): FamilyTreeDebugUnion[] {
  const byChild = new Map<string, string[]>();
  for (const r of rels) {
    if (r.type !== "parent_of") continue;
    const list = byChild.get(r.toNodeId) ?? [];
    list.push(r.fromNodeId);
    byChild.set(r.toNodeId, list);
  }

  const unions = new Map<string, { spouseIds: string[]; childIds: string[] }>();
  for (const [childId, parents] of byChild) {
    const unique = [...new Set(parents)].sort();
    if (unique.length === 0) continue;
    const key = unique.join("+");
    const existing = unions.get(key) ?? { spouseIds: unique, childIds: [] };
    existing.childIds.push(childId);
    unions.set(key, existing);
  }

  return [...unions.entries()].map(([id, u]) => {
    const spouseIds = u.spouseIds as [string, string] | [string];
    let inferredSide: FamilyTreeDebugUnion["inferredSide"] = "unattached";
    if (focus) {
      const sides = u.spouseIds.map((pid) =>
        inferPersonSide(rels, pid, focus),
      );
      if (sides.every((s) => s === "left")) inferredSide = "left";
      else if (sides.every((s) => s === "right")) inferredSide = "right";
      else if (sides.some((s) => s === "left") && sides.some((s) => s === "right"))
        inferredSide = "shared";
      else if (sides.includes("shared")) inferredSide = "shared";
      else inferredSide = sides[0] ?? "unattached";
    }
    void nodes;
    return {
      id,
      spouseIds,
      childIds: [...new Set(u.childIds)].sort(),
      inferredSide,
    };
  });
}

/**
 * Build a downloadable debug dump for one vault owner's family tree.
 */
export async function buildFamilyTreeDebugExport(
  treeOwnerUserId: string,
  options: FamilyTreeDebugExportOptions = {},
): Promise<FamilyTreeDebugExport> {
  const skipRepair = options.skipRepair !== false;
  const graph = await getFamilyTreeGraph(treeOwnerUserId, { skipRepair });

  const rels: Rel[] = graph.relationships.map((r) => ({
    id: r.id,
    fromNodeId: r.fromNodeId,
    toNodeId: r.toNodeId,
    type: r.type,
    createdAt: r.createdAt,
  }));

  const nodeBasics = graph.nodes.map((n) => ({
    id: n.id,
    label: n.label,
  }));

  const focusPair = inferFocusCouple(nodeBasics, rels);
  const focusCouple = focusPair
    ? {
        leftId: focusPair.leftId,
        rightId: focusPair.rightId,
        leftLabel:
          graph.nodes.find((n) => n.id === focusPair.leftId)?.label ??
          focusPair.leftId,
        rightLabel:
          graph.nodes.find((n) => n.id === focusPair.rightId)?.label ??
          focusPair.rightId,
      }
    : null;

  let layoutById = new Map<string, { x: number; y: number }>();
  let layoutComputed = false;
  try {
    const layout = computeFamilyTreeLayout(
      graph.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        generation: graph.generations[n.id],
      })),
      rels.map((r) => ({
        fromNodeId: r.fromNodeId,
        toNodeId: r.toNodeId,
        type: r.type,
        id: r.id,
      })),
    );
    layoutById = new Map(
      layout.nodes.map((n) => [n.id, { x: n.x, y: n.y }]),
    );
    layoutComputed = true;
  } catch {
    layoutComputed = false;
  }

  const personSummaries: FamilyTreeDebugPersonSummary[] = graph.nodes.map(
    (n) => {
      const layoutPos = layoutById.get(n.id) ?? null;
      return {
        id: n.id,
        label: n.label,
        personId: n.personId,
        isPlaceholder: !n.personId,
        inferredGeneration: graph.generations[n.id] ?? 0,
        inferredSide: inferPersonSide(rels, n.id, focusPair),
        parentIds: parentsOf(rels, n.id),
        spouseIds: undirectedNeighbors(rels, "partner_of", n.id),
        siblingIds: undirectedNeighbors(rels, "sibling_of", n.id),
        childIds: childrenOf(rels, n.id),
        cousinIds: undirectedNeighbors(rels, "cousin_of", n.id),
        layout: layoutPos,
      };
    },
  );

  const parentUnions = buildParentUnions(nodeBasics, rels, focusPair);

  return {
    exportedAt: new Date().toISOString(),
    treeOwnerUserId,
    focusCouple,
    nodes: graph.nodes.map((n) => {
      const pos = layoutById.get(n.id);
      return {
        id: n.id,
        label: n.label,
        displayName: n.person?.displayName?.trim() || n.label,
        personId: n.personId,
        isPlaceholder: !n.personId,
        notes: n.notes,
        generation: graph.generations[n.id] ?? 0,
        lineageSide: null,
        layoutX: pos?.x ?? null,
        layoutY: pos?.y ?? null,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
      };
    }),
    relationships: rels.map((r) => ({
      id: r.id,
      type: r.type,
      fromId: r.fromNodeId,
      toId: r.toNodeId,
      createdAt: r.createdAt.toISOString(),
    })),
    derivedRelationships: graph.derived.map((d) => ({
      type: d.type,
      fromId: d.fromNodeId,
      toId: d.toNodeId,
      inferred: d.inferred,
    })),
    parentUnions,
    personSummaries,
    meta: {
      nodeCount: graph.nodes.length,
      relationshipCount: graph.relationships.length,
      layoutComputed,
      skipRepair,
      note: `Layout coordinates are computed (not stored). Node width reference: ${TREE_LAYOUT.nodeWidth}px. No emails, passwords, or media URLs included.`,
    },
  };
}

export function familyTreeDebugFilename(treeOwnerUserId: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const short = treeOwnerUserId.slice(0, 12);
  return `family-tree-debug-${short}-${stamp}.json`;
}
