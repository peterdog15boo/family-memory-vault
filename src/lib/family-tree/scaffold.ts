/**
 * Auto-scaffold minimum placeholder structure when adding extended relationships
 * (cousin, niece/nephew, in-laws) so the tree layout stays readable.
 *
 * Never renames existing nodes or removes existing relationships. Only inserts
 * missing placeholders and bridge links required by the chosen relation.
 */

import type { FamilyTreeRelationType } from "@/lib/db/schema";
import { canonicalizeRelationshipEndpoints } from "@/lib/family-tree/relations";

export type ScaffoldGraphNode = {
  id: string;
  label: string;
  /** Linked People id — null means placeholder. */
  personId: string | null;
};

export type ScaffoldGraphEdge = {
  fromNodeId: string;
  toNodeId: string;
  type: FamilyTreeRelationType;
};

export type ScaffoldGraph = {
  nodes: ScaffoldGraphNode[];
  relationships: ScaffoldGraphEdge[];
};

export type ScaffoldPlannedNode = {
  /** Temporary key used only inside the plan (e.g. "new:parent-a"). */
  key: string;
  label: string;
};

export type ScaffoldPlannedEdge = {
  fromKey: string;
  toKey: string;
  type: FamilyTreeRelationType;
};

export type FamilyTreeScaffoldPlan = {
  nodes: ScaffoldPlannedNode[];
  relationships: ScaffoldPlannedEdge[];
  /** Short UX copy when anything was planned; null if nothing to add. */
  message: string | null;
};

const NEW_PREFIX = "new:";

function isNewKey(key: string): boolean {
  return key.startsWith(NEW_PREFIX);
}

function parentsOf(graph: ScaffoldGraph, nodeId: string): string[] {
  return graph.relationships
    .filter((r) => r.type === "parent_of" && r.toNodeId === nodeId)
    .map((r) => r.fromNodeId);
}

function siblingsOf(graph: ScaffoldGraph, nodeId: string): string[] {
  const fromEdges = new Set<string>();
  for (const r of graph.relationships) {
    if (r.type !== "sibling_of") continue;
    if (r.fromNodeId === nodeId) fromEdges.add(r.toNodeId);
    if (r.toNodeId === nodeId) fromEdges.add(r.fromNodeId);
  }
  // Shared parents also count as siblings for structure checks.
  const myParents = parentsOf(graph, nodeId);
  if (myParents.length > 0) {
    const parentSet = new Set(myParents);
    const childIds = new Set<string>();
    for (const r of graph.relationships) {
      if (r.type === "parent_of" && parentSet.has(r.fromNodeId)) {
        childIds.add(r.toNodeId);
      }
    }
    for (const id of childIds) {
      if (id !== nodeId) fromEdges.add(id);
    }
  }
  return [...fromEdges];
}

function partnersOf(graph: ScaffoldGraph, nodeId: string): string[] {
  const out: string[] = [];
  for (const r of graph.relationships) {
    if (r.type !== "partner_of") continue;
    if (r.fromNodeId === nodeId) out.push(r.toNodeId);
    if (r.toNodeId === nodeId) out.push(r.fromNodeId);
  }
  return out;
}

function shareAParent(
  graph: ScaffoldGraph,
  a: string,
  b: string,
): boolean {
  const pa = new Set(parentsOf(graph, a));
  if (pa.size === 0) return false;
  return parentsOf(graph, b).some((p) => pa.has(p));
}

function areSiblings(graph: ScaffoldGraph, a: string, b: string): boolean {
  if (a === b) return true;
  return siblingsOf(graph, a).includes(b) || shareAParent(graph, a, b);
}

function hasParentLink(
  graph: ScaffoldGraph,
  parentId: string,
  childId: string,
): boolean {
  return graph.relationships.some(
    (r) =>
      r.type === "parent_of" &&
      r.fromNodeId === parentId &&
      r.toNodeId === childId,
  );
}

function hasPartnerLink(graph: ScaffoldGraph, a: string, b: string): boolean {
  return partnersOf(graph, a).includes(b);
}

function hasAnyParentChild(
  graph: ScaffoldGraph,
  a: string,
  b: string,
): boolean {
  return hasParentLink(graph, a, b) || hasParentLink(graph, b, a);
}

function safeToAddSibling(
  graph: ScaffoldGraph,
  a: string,
  b: string,
): boolean {
  if (a === b) return false;
  if (areSiblings(graph, a, b)) return false;
  if (hasPartnerLink(graph, a, b)) return false;
  if (hasAnyParentChild(graph, a, b)) return false;
  return true;
}

function safeToAddPartner(
  graph: ScaffoldGraph,
  a: string,
  b: string,
): boolean {
  if (a === b) return false;
  if (hasPartnerLink(graph, a, b)) return false;
  if (areSiblings(graph, a, b)) return false;
  if (hasAnyParentChild(graph, a, b)) return false;
  return true;
}

function safeToAddParent(
  graph: ScaffoldGraph,
  parentId: string,
  childId: string,
): boolean {
  if (parentId === childId) return false;
  if (hasParentLink(graph, parentId, childId)) return false;
  if (hasParentLink(graph, childId, parentId)) return false;
  if (hasPartnerLink(graph, parentId, childId)) return false;
  return true;
}

function cousinsStructurallyLinked(
  graph: ScaffoldGraph,
  a: string,
  b: string,
): boolean {
  const parentsA = parentsOf(graph, a);
  const parentsB = parentsOf(graph, b);
  for (const pa of parentsA) {
    for (const pb of parentsB) {
      if (pa === pb || areSiblings(graph, pa, pb)) return true;
    }
  }
  return false;
}

function nieceStructurallyLinked(
  graph: ScaffoldGraph,
  nieceId: string,
  auntUncleId: string,
): boolean {
  if (hasParentLink(graph, auntUncleId, nieceId)) return true;
  return parentsOf(graph, nieceId).some((p) =>
    areSiblings(graph, p, auntUncleId),
  );
}

function inLawStructurallyLinked(
  graph: ScaffoldGraph,
  a: string,
  b: string,
): boolean {
  // A is sibling of B's partner, or A is partner of B's sibling.
  for (const partner of partnersOf(graph, b)) {
    if (areSiblings(graph, a, partner)) return true;
  }
  for (const sibling of siblingsOf(graph, b)) {
    if (hasPartnerLink(graph, a, sibling)) return true;
  }
  for (const partner of partnersOf(graph, a)) {
    if (areSiblings(graph, b, partner)) return true;
  }
  for (const sibling of siblingsOf(graph, a)) {
    if (hasPartnerLink(graph, b, sibling)) return true;
  }
  return false;
}

type PlanBuilder = {
  nodes: ScaffoldPlannedNode[];
  relationships: ScaffoldPlannedEdge[];
  /** Working copy of graph including planned edges (existing ids + new keys). */
  working: ScaffoldGraph;
  nextParentLabel: () => string;
};

function createBuilder(graph: ScaffoldGraph): PlanBuilder {
  let parentOrdinal = 0;
  const labels = ["Mom", "Dad", "Parent"] as const;
  return {
    nodes: [],
    relationships: [],
    working: {
      nodes: graph.nodes.map((n) => ({ ...n })),
      relationships: graph.relationships.map((r) => ({ ...r })),
    },
    nextParentLabel: () => {
      const label = labels[Math.min(parentOrdinal, labels.length - 1)]!;
      parentOrdinal += 1;
      return label;
    },
  };
}

function addNode(builder: PlanBuilder, key: string, label: string): string {
  builder.nodes.push({ key, label });
  builder.working.nodes.push({ id: key, label, personId: null });
  return key;
}

function addEdge(
  builder: PlanBuilder,
  fromKey: string,
  toKey: string,
  type: FamilyTreeRelationType,
): void {
  const endpoints = canonicalizeRelationshipEndpoints(type, fromKey, toKey);
  builder.relationships.push({
    fromKey: endpoints.fromNodeId,
    toKey: endpoints.toNodeId,
    type,
  });
  builder.working.relationships.push({
    fromNodeId: endpoints.fromNodeId,
    toNodeId: endpoints.toNodeId,
    type,
  });
}

function bloodParentsOf(graph: ScaffoldGraph, nodeId: string): string[] {
  const parents = parentsOf(graph, nodeId);
  if (parents.length === 0) return [];
  const partnerParentIds = new Set(
    partnersOf(graph, nodeId).flatMap((partnerId) =>
      parentsOf(graph, partnerId),
    ),
  );
  // Prefer parents that are not also parents of a partner (in-law side).
  const blood = parents.filter((id) => !partnerParentIds.has(id));
  return blood.length > 0 ? blood : [];
}

function ensureParentKey(
  builder: PlanBuilder,
  childId: string,
  preferredKey: string,
): string {
  const blood = bloodParentsOf(builder.working, childId);
  if (blood[0]) return blood[0]!;

  // Do not reuse a spouse's parents for cousin/niece scaffolding — that
  // incorrectly attaches the new relative to the partner's bloodline.
  const key = addNode(builder, preferredKey, builder.nextParentLabel());
  if (safeToAddParent(builder.working, key, childId)) {
    addEdge(builder, key, childId, "parent_of");
  }
  return key;
}

function planCousin(
  builder: PlanBuilder,
  a: string,
  b: string,
): string | null {
  if (cousinsStructurallyLinked(builder.working, a, b)) return null;

  const parentA = ensureParentKey(builder, a, `${NEW_PREFIX}cousin-parent-a`);
  const parentB = ensureParentKey(builder, b, `${NEW_PREFIX}cousin-parent-b`);

  if (
    parentA !== parentB &&
    safeToAddSibling(builder.working, parentA, parentB)
  ) {
    addEdge(builder, parentA, parentB, "sibling_of");
  }

  if (builder.nodes.length === 0 && builder.relationships.length === 0) {
    return null;
  }
  return "Added placeholder parents so this cousin relationship displays correctly.";
}

function planNieceNephew(
  builder: PlanBuilder,
  nieceId: string,
  auntUncleId: string,
  kind: "niece" | "nephew",
): string | null {
  if (nieceStructurallyLinked(builder.working, nieceId, auntUncleId)) {
    return null;
  }

  // Reuse an existing sibling of the aunt/uncle as the bridging parent.
  for (const sibling of siblingsOf(builder.working, auntUncleId)) {
    if (safeToAddParent(builder.working, sibling, nieceId)) {
      addEdge(builder, sibling, nieceId, "parent_of");
      return kind === "niece"
        ? "Linked through an existing sibling so this niece relationship displays correctly."
        : "Linked through an existing sibling so this nephew relationship displays correctly.";
    }
  }

  const parents = bloodParentsOf(builder.working, nieceId);
  const bridge = parents[0];

  if (bridge) {
    if (safeToAddSibling(builder.working, bridge, auntUncleId)) {
      addEdge(builder, bridge, auntUncleId, "sibling_of");
      return kind === "niece"
        ? "Connected a parent as sibling so this niece relationship displays correctly."
        : "Connected a parent as sibling so this nephew relationship displays correctly.";
    }
    return null;
  }

  const parentKey = addNode(
    builder,
    `${NEW_PREFIX}nibling-parent`,
    "Parent",
  );
  if (safeToAddParent(builder.working, parentKey, nieceId)) {
    addEdge(builder, parentKey, nieceId, "parent_of");
  }
  if (safeToAddSibling(builder.working, parentKey, auntUncleId)) {
    addEdge(builder, parentKey, auntUncleId, "sibling_of");
  }

  return kind === "niece"
    ? "Added a placeholder parent so this niece relationship displays correctly."
    : "Added a placeholder parent so this nephew relationship displays correctly.";
}

function planInLaw(
  builder: PlanBuilder,
  a: string,
  b: string,
  kind: "sister_in_law" | "brother_in_law",
): string | null {
  if (inLawStructurallyLinked(builder.working, a, b)) return null;

  // Prefer: sibling of B's existing partner.
  for (const partner of partnersOf(builder.working, b)) {
    if (safeToAddSibling(builder.working, a, partner)) {
      addEdge(builder, a, partner, "sibling_of");
      return kind === "sister_in_law"
        ? "Connected through a partner so this sister-in-law relationship displays correctly."
        : "Connected through a partner so this brother-in-law relationship displays correctly.";
    }
  }

  // Prefer: partner of B's existing sibling.
  for (const sibling of siblingsOf(builder.working, b)) {
    if (safeToAddPartner(builder.working, a, sibling)) {
      addEdge(builder, a, sibling, "partner_of");
      return kind === "sister_in_law"
        ? "Connected through a sibling so this sister-in-law relationship displays correctly."
        : "Connected through a sibling so this brother-in-law relationship displays correctly.";
    }
  }

  // Prefer: partner of A's existing sibling → sibling of B… handled above symmetrically
  for (const partner of partnersOf(builder.working, a)) {
    if (safeToAddSibling(builder.working, b, partner)) {
      addEdge(builder, b, partner, "sibling_of");
      return kind === "sister_in_law"
        ? "Connected through a partner so this sister-in-law relationship displays correctly."
        : "Connected through a partner so this brother-in-law relationship displays correctly.";
    }
  }

  for (const sibling of siblingsOf(builder.working, a)) {
    if (safeToAddPartner(builder.working, b, sibling)) {
      addEdge(builder, b, sibling, "partner_of");
      return kind === "sister_in_law"
        ? "Connected through a sibling so this sister-in-law relationship displays correctly."
        : "Connected through a sibling so this brother-in-law relationship displays correctly.";
    }
  }

  // Minimum new structure: B's partner + sibling link to A.
  const partnerKey = addNode(
    builder,
    `${NEW_PREFIX}inlaw-partner`,
    "Partner",
  );
  if (safeToAddPartner(builder.working, b, partnerKey)) {
    addEdge(builder, b, partnerKey, "partner_of");
  }
  if (safeToAddSibling(builder.working, a, partnerKey)) {
    addEdge(builder, a, partnerKey, "sibling_of");
  }

  return kind === "sister_in_law"
    ? "Added a placeholder partner so this sister-in-law relationship displays correctly."
    : "Added a placeholder partner so this brother-in-law relationship displays correctly.";
}

/**
 * Plan placeholder nodes + structural edges for an extended relationship.
 * Core types (parent/partner/sibling) need no scaffold.
 */
export function planFamilyTreeScaffold(
  graph: ScaffoldGraph,
  input: {
    fromNodeId: string;
    toNodeId: string;
    type: FamilyTreeRelationType;
  },
): FamilyTreeScaffoldPlan {
  const empty: FamilyTreeScaffoldPlan = {
    nodes: [],
    relationships: [],
    message: null,
  };

  if (input.fromNodeId === input.toNodeId) return empty;
  if (!graph.nodes.some((n) => n.id === input.fromNodeId)) return empty;
  if (!graph.nodes.some((n) => n.id === input.toNodeId)) return empty;

  const builder = createBuilder(graph);
  let message: string | null = null;

  switch (input.type) {
    case "cousin_of":
      message = planCousin(builder, input.fromNodeId, input.toNodeId);
      break;
    case "niece_of":
      message = planNieceNephew(
        builder,
        input.fromNodeId,
        input.toNodeId,
        "niece",
      );
      break;
    case "nephew_of":
      message = planNieceNephew(
        builder,
        input.fromNodeId,
        input.toNodeId,
        "nephew",
      );
      break;
    case "sister_in_law_of":
      message = planInLaw(
        builder,
        input.fromNodeId,
        input.toNodeId,
        "sister_in_law",
      );
      break;
    case "brother_in_law_of":
      message = planInLaw(
        builder,
        input.fromNodeId,
        input.toNodeId,
        "brother_in_law",
      );
      break;
    default:
      return empty;
  }

  if (builder.nodes.length === 0 && builder.relationships.length === 0) {
    return empty;
  }

  return {
    nodes: builder.nodes,
    relationships: builder.relationships,
    message,
  };
}

export function isScaffoldTempKey(key: string): boolean {
  return isNewKey(key);
}
