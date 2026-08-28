/**
 * Cousin lineage structure — bloodline parentUnion on the *subject's* side.
 *
 * Visual layout must follow this graph; it must not invent spouse-side placement.
 *
 * addCousin(subject, cousin) writes:
 * - parents for the cousin (aunt/uncle couple) when missing
 * - sibling bridge from that couple to one of the subject's blood parents
 * - never a bridge through the subject's spouse's parents
 */

import type { CousinSide } from "@/lib/family-tree/cousin-side";
import { pickParentIdForCousinSide } from "@/lib/family-tree/cousin-side";
import type { FamilyTreeRelationType } from "@/lib/db/schema";

export type CousinLineageNode = {
  id: string;
  label: string;
};

export type CousinLineageEdge = {
  id?: string;
  fromNodeId: string;
  toNodeId: string;
  type: FamilyTreeRelationType;
};

export type CousinLineageGraph = {
  nodes: CousinLineageNode[];
  relationships: CousinLineageEdge[];
};

function parentsOf(graph: CousinLineageGraph, childId: string): string[] {
  return graph.relationships
    .filter((e) => e.type === "parent_of" && e.toNodeId === childId)
    .map((e) => e.fromNodeId);
}

function partnersOf(graph: CousinLineageGraph, id: string): string[] {
  const out: string[] = [];
  for (const e of graph.relationships) {
    if (e.type !== "partner_of") continue;
    if (e.fromNodeId === id) out.push(e.toNodeId);
    else if (e.toNodeId === id) out.push(e.fromNodeId);
  }
  return out;
}

function areSiblings(
  graph: CousinLineageGraph,
  a: string,
  b: string,
): boolean {
  if (a === b) return false;
  return graph.relationships.some(
    (e) =>
      e.type === "sibling_of" &&
      ((e.fromNodeId === a && e.toNodeId === b) ||
        (e.fromNodeId === b && e.toNodeId === a)),
  );
}

/**
 * Parents of `childId` that are not also parents of a partner (in-law side).
 */
export function bloodParentsOfSubject(
  graph: CousinLineageGraph,
  childId: string,
): string[] {
  const parents = parentsOf(graph, childId);
  if (parents.length === 0) return [];
  const partnerParentIds = new Set(
    partnersOf(graph, childId).flatMap((partnerId) =>
      parentsOf(graph, partnerId),
    ),
  );
  const blood = parents.filter((id) => !partnerParentIds.has(id));
  return blood.length > 0 ? blood : [];
}

/**
 * True when cousin parents are already sibling-linked (or shared) with the
 * subject's *blood* parents — the correct lineage parentUnion.
 */
export function cousinsLinkedOnSubjectLineage(
  graph: CousinLineageGraph,
  subjectId: string,
  cousinId: string,
): boolean {
  const subjectParents = bloodParentsOfSubject(graph, subjectId);
  if (subjectParents.length === 0) return false;
  const cousinParents = parentsOf(graph, cousinId);
  if (cousinParents.length === 0) return false;
  for (const sp of subjectParents) {
    for (const cp of cousinParents) {
      if (sp === cp || areSiblings(graph, sp, cp)) return true;
    }
  }
  return false;
}

/**
 * Pick which endpoint is the lineage subject for an undirected cousin_of edge.
 * Prefer the person who already has blood parents (and a partner) — e.g. Kathy
 * in a Jeff+Kathy focus tree — so bridges attach to their side.
 */
export function preferCousinSubjectId(
  graph: CousinLineageGraph,
  a: string,
  b: string,
): string {
  const score = (id: string): number => {
    let s = 0;
    if (bloodParentsOfSubject(graph, id).length > 0) s += 3;
    else if (parentsOf(graph, id).length > 0) s += 1;
    if (partnersOf(graph, id).length > 0) s += 2;
    return s;
  };
  return score(a) >= score(b) ? a : b;
}

export function pickSubjectBridgeParentId(
  graph: CousinLineageGraph,
  subjectId: string,
  side?: CousinSide,
): string | null {
  const blood = bloodParentsOfSubject(graph, subjectId);
  if (blood.length === 0) return null;
  const labeled = blood.map((id) => {
    const node = graph.nodes.find((n) => n.id === id);
    return { id, label: node?.label ?? id };
  });
  return pickParentIdForCousinSide(labeled, side ?? "unknown");
}

/**
 * Sibling bridges from cousin parents onto the subject's *spouse's* parents.
 * These park the cousin on the wrong flank and must be retargeted/removed.
 */
export function findWrongSpouseSideCousinBridges(
  graph: CousinLineageGraph,
  subjectId: string,
  cousinId: string,
): CousinLineageEdge[] {
  const spouseIds = partnersOf(graph, subjectId);
  if (spouseIds.length === 0) return [];
  const spouseParents = new Set(
    spouseIds.flatMap((id) => parentsOf(graph, id)),
  );
  const cousinParents = parentsOf(graph, cousinId);
  const subjectParents = new Set(bloodParentsOfSubject(graph, subjectId));
  const wrong: CousinLineageEdge[] = [];

  for (const e of graph.relationships) {
    if (e.type !== "sibling_of") continue;
    const ends = [e.fromNodeId, e.toNodeId];
    const cousinParent = ends.find((id) => cousinParents.includes(id));
    const spouseParent = ends.find((id) => spouseParents.has(id));
    if (!cousinParent || !spouseParent) continue;
    // Already also linked to subject bloodline — still wrong edge to drop later
    if (subjectParents.has(spouseParent)) continue;
    wrong.push(e);
  }
  return wrong;
}

export type CousinLineageStatus = {
  subjectId: string;
  cousinId: string;
  ok: boolean;
  subjectBridgeParentId: string | null;
  cousinHasParents: boolean;
  linkedOnSubjectLineage: boolean;
  wrongSpouseBridges: CousinLineageEdge[];
};

export function analyzeCousinLineage(
  graph: CousinLineageGraph,
  a: string,
  b: string,
  preferredSubjectId?: string,
): CousinLineageStatus {
  const subjectId =
    preferredSubjectId === a || preferredSubjectId === b
      ? preferredSubjectId
      : preferCousinSubjectId(graph, a, b);
  const cousinId = subjectId === a ? b : a;
  const subjectBridgeParentId = pickSubjectBridgeParentId(graph, subjectId);
  const cousinHasParents = parentsOf(graph, cousinId).length > 0;
  const linkedOnSubjectLineage = cousinsLinkedOnSubjectLineage(
    graph,
    subjectId,
    cousinId,
  );
  const wrongSpouseBridges = findWrongSpouseSideCousinBridges(
    graph,
    subjectId,
    cousinId,
  );
  return {
    subjectId,
    cousinId,
    ok:
      linkedOnSubjectLineage &&
      cousinHasParents &&
      wrongSpouseBridges.length === 0 &&
      subjectBridgeParentId != null,
    subjectBridgeParentId,
    cousinHasParents,
    linkedOnSubjectLineage,
    wrongSpouseBridges,
  };
}
