/**
 * Family Tree completeness — progress metrics, badges, and next-best actions.
 * Pure helpers so the UI can stay encouraging and easy for non-genealogists.
 */

import type { SerializedFamilyTreeGraph } from "@/lib/family-tree/serialize";

export type TreeCompletenessMetricId =
  | "peoplePlaced"
  | "photosOnTree"
  | "parentsFilled"
  | "partnersFilled";

export type TreeCompletenessBadgeId =
  | "first_branch"
  | "three_generations"
  | "photo_complete_core"
  | "ten_people";

export type TreeNextActionKind =
  | "place_person"
  | "add_parents"
  | "add_partner"
  | "link_photo"
  | "invite_family"
  | "upload_photo"
  | "add_person"
  | "all_done";

export type TreeCompletenessMetric = {
  id: TreeCompletenessMetricId;
  label: string;
  done: number;
  total: number;
  /** 0–100 for this bar; 100 when total is 0 (nothing to fill yet). */
  percent: number;
};

export type TreeCompletenessBadge = {
  id: TreeCompletenessBadgeId;
  title: string;
  description: string;
  earned: boolean;
};

export type TreeNextAction = {
  kind: TreeNextActionKind;
  /** Short, warm headline — e.g. “Add Mom’s parents”. */
  title: string;
  body: string;
  cta: string;
  nodeId?: string;
  personId?: string;
  href?: string;
};

export type FamilyTreeCompletenessSnapshot = {
  percent: number;
  metrics: TreeCompletenessMetric[];
  badges: TreeCompletenessBadge[];
  earnedBadgeIds: TreeCompletenessBadgeId[];
  nextAction: TreeNextAction;
  encouragement: string;
};

export type ComputeFamilyTreeCompletenessInput = {
  tree: SerializedFamilyTreeGraph;
  /** Total People in the vault (named faces). */
  peopleCount: number;
  /** People not yet placed on the tree. */
  availablePeople: Array<{ id: string; displayName: string }>;
  /** personId → has a usable photo preview. */
  hasPhotoByPersonId: ReadonlyMap<string, boolean> | Record<string, boolean>;
};

function ratioPercent(done: number, total: number): number {
  if (total <= 0) return 100;
  return Math.round((100 * Math.max(0, Math.min(done, total))) / total);
}

function hasPhotoLookup(
  map: ComputeFamilyTreeCompletenessInput["hasPhotoByPersonId"],
  personId: string,
): boolean {
  if (map instanceof Map) return Boolean(map.get(personId));
  return Boolean((map as Record<string, boolean>)[personId]);
}

function buildParentChildMaps(tree: SerializedFamilyTreeGraph) {
  const parentsByChild = new Map<string, Set<string>>();
  const childrenByParent = new Map<string, Set<string>>();
  const partnersByNode = new Map<string, Set<string>>();

  for (const rel of tree.relationships) {
    if (rel.type === "parent_of") {
      const parents = parentsByChild.get(rel.toNodeId) ?? new Set();
      parents.add(rel.fromNodeId);
      parentsByChild.set(rel.toNodeId, parents);

      const children = childrenByParent.get(rel.fromNodeId) ?? new Set();
      children.add(rel.toNodeId);
      childrenByParent.set(rel.fromNodeId, children);
    } else if (rel.type === "partner_of") {
      const a = partnersByNode.get(rel.fromNodeId) ?? new Set();
      a.add(rel.toNodeId);
      partnersByNode.set(rel.fromNodeId, a);
      const b = partnersByNode.get(rel.toNodeId) ?? new Set();
      b.add(rel.fromNodeId);
      partnersByNode.set(rel.toNodeId, b);
    }
  }

  return { parentsByChild, childrenByParent, partnersByNode };
}

function nodeHasPhoto(
  node: SerializedFamilyTreeGraph["nodes"][number],
  hasPhotoByPersonId: ComputeFamilyTreeCompletenessInput["hasPhotoByPersonId"],
): boolean {
  if (!node.personId) return false;
  return hasPhotoLookup(hasPhotoByPersonId, node.personId);
}

function possessive(label: string): string {
  const trimmed = label.trim() || "someone";
  return /s$/i.test(trimmed) ? `${trimmed}’` : `${trimmed}’s`;
}

/**
 * Encouraging headline based on overall percent — never guilt-tripping.
 */
export function treeCompletenessEncouragement(percent: number): string {
  if (percent >= 100) {
    return "Your family story looks wonderfully full — keep adding whenever a new memory appears.";
  }
  if (percent >= 75) {
    return "Beautiful progress. A few more connections and this tree will really shine.";
  }
  if (percent >= 40) {
    return "Nice branches already! Every name and photo makes the story richer.";
  }
  if (percent >= 1) {
    return "Great start — trees grow one relative at a time. You’ve got this.";
  }
  return "Plant your first name or photo below — small steps grow into generations.";
}

function pickNextAction(
  input: ComputeFamilyTreeCompletenessInput,
  maps: ReturnType<typeof buildParentChildMaps>,
): TreeNextAction {
  const { tree, availablePeople, hasPhotoByPersonId } = input;
  const { parentsByChild, childrenByParent, partnersByNode } = maps;

  if (tree.nodes.length === 0) {
    if (availablePeople.length > 0) {
      const person = availablePeople[0]!;
      return {
        kind: "place_person",
        title: `Place ${person.displayName} on the tree`,
        body: "They’re already in People — one tap puts them on your branches.",
        cta: "Add to tree",
        personId: person.id,
      };
    }
    return {
      kind: "add_person",
      title: "Add your first relative",
      body: "Start with Mom, Dad, or yourself — a photo can come later.",
      cta: "Add by name",
    };
  }

  if (availablePeople.length > 0) {
    const person = availablePeople[0]!;
    return {
      kind: "place_person",
      title: `Place ${person.displayName} on the tree`,
      body: "They’re waiting in People — place them when you’re ready.",
      cta: "Add to tree",
      personId: person.id,
    };
  }

  // Prefer someone with kids but missing parents (“Add Mom’s parents”).
  const needsParents = tree.nodes
    .map((node) => {
      const parentCount = parentsByChild.get(node.id)?.size ?? 0;
      const childCount = childrenByParent.get(node.id)?.size ?? 0;
      const interesting = childCount > 0 || parentCount === 1;
      return { node, parentCount, childCount, interesting };
    })
    .filter((row) => row.interesting && row.parentCount < 2)
    .sort((a, b) => a.parentCount - b.parentCount || b.childCount - a.childCount);

  const parentGap = needsParents[0];
  if (parentGap) {
    const label = parentGap.node.label;
    if (parentGap.parentCount === 0) {
      return {
        kind: "add_parents",
        title: `Add ${possessive(label)} parents`,
        body: "Two little parent circles fill out this branch — names are enough for now.",
        cta: "Add a parent",
        nodeId: parentGap.node.id,
      };
    }
    return {
      kind: "add_parents",
      title: `Add ${possessive(label)} other parent`,
      body: "One parent is on the tree — add the other when you know them.",
      cta: "Add parent",
      nodeId: parentGap.node.id,
    };
  }

  const placeholder = tree.nodes.find(
    (n) => n.isPlaceholder || !nodeHasPhoto(n, hasPhotoByPersonId),
  );
  if (placeholder) {
    if (placeholder.isPlaceholder || !placeholder.personId) {
      return {
        kind: "link_photo",
        title: `Give ${placeholder.label} a photo`,
        body: "Link a Person from your vault, or upload a photo and come back to connect it.",
        cta: "Link a Person",
        nodeId: placeholder.id,
      };
    }
    return {
      kind: "upload_photo",
      title: `Add a photo for ${placeholder.label}`,
      body: "A face makes this branch feel alive — upload whenever you have one.",
      cta: "Upload a photo",
      nodeId: placeholder.id,
      href: "/upload",
    };
  }

  const needsPartner = tree.nodes.find((node) => {
    const kids = childrenByParent.get(node.id)?.size ?? 0;
    if (kids === 0) return false;
    return (partnersByNode.get(node.id)?.size ?? 0) === 0;
  });
  if (needsPartner) {
    return {
      kind: "add_partner",
      title: `Add a partner for ${needsPartner.label}`,
      body: "Optional, but it often completes the picture for this generation.",
      cta: "Add partner",
      nodeId: needsPartner.id,
    };
  }

  return {
    kind: "invite_family",
    title: "Ask family to help complete the tree",
    body: "When they share photos, faces can gather in your People — then you place them here. Each person’s People stay private to their account.",
    cta: "Ask family to help complete the tree",
    href: "/family",
  };
}

function computeBadges(
  tree: SerializedFamilyTreeGraph,
  maps: ReturnType<typeof buildParentChildMaps>,
  hasPhotoByPersonId: ComputeFamilyTreeCompletenessInput["hasPhotoByPersonId"],
): TreeCompletenessBadge[] {
  const parentEdges = tree.relationships.filter((r) => r.type === "parent_of");
  const gens = Object.values(tree.generations);
  const genSpan =
    gens.length === 0 ? 0 : Math.max(...gens) - Math.min(...gens) + 1;

  const coreIds = new Set<string>();
  for (const [childId, parents] of maps.parentsByChild) {
    coreIds.add(childId);
    for (const p of parents) coreIds.add(p);
  }
  for (const [id, partners] of maps.partnersByNode) {
    coreIds.add(id);
    for (const p of partners) coreIds.add(p);
  }

  const coreNodes = tree.nodes.filter((n) => coreIds.has(n.id));
  const photoCompleteCore =
    coreNodes.length >= 2 &&
    coreNodes.every((n) => nodeHasPhoto(n, hasPhotoByPersonId));

  return [
    {
      id: "first_branch",
      title: "First branch",
      description: "Connected a parent and child",
      earned: parentEdges.length > 0,
    },
    {
      id: "three_generations",
      title: "Three generations",
      description: "Your tree spans grandparents to kids",
      earned: genSpan >= 3,
    },
    {
      id: "photo_complete_core",
      title: "Photo-complete core",
      description: "Connected family members all have photos",
      earned: photoCompleteCore,
    },
    {
      id: "ten_people",
      title: "Growing grove",
      description: "10 people on the tree",
      earned: tree.nodes.length >= 10,
    },
  ];
}

/**
 * Score the live tree for the Completeness card.
 */
export function computeFamilyTreeCompleteness(
  input: ComputeFamilyTreeCompletenessInput,
): FamilyTreeCompletenessSnapshot {
  const { tree, peopleCount, hasPhotoByPersonId } = input;
  const maps = buildParentChildMaps(tree);
  const { parentsByChild, childrenByParent, partnersByNode } = maps;

  const linkedOnTree = tree.nodes.filter((n) => Boolean(n.personId)).length;
  const placeTotal = Math.max(peopleCount, linkedOnTree);
  const placeDone = linkedOnTree;

  const photoDone = tree.nodes.filter((n) =>
    nodeHasPhoto(n, hasPhotoByPersonId),
  ).length;
  const photoTotal = tree.nodes.length;

  // Parent slots: up to 2 per person who is already in a parent/child chain.
  let parentDone = 0;
  let parentTotal = 0;
  for (const node of tree.nodes) {
    const parentCount = parentsByChild.get(node.id)?.size ?? 0;
    const childCount = childrenByParent.get(node.id)?.size ?? 0;
    if (parentCount === 0 && childCount === 0) continue;
    parentTotal += 2;
    parentDone += Math.min(2, parentCount);
  }

  // Partner slots: people with kids (or who already have a partner).
  let partnerDone = 0;
  let partnerTotal = 0;
  for (const node of tree.nodes) {
    const kids = childrenByParent.get(node.id)?.size ?? 0;
    const partners = partnersByNode.get(node.id)?.size ?? 0;
    if (kids === 0 && partners === 0) continue;
    partnerTotal += 1;
    if (partners > 0) partnerDone += 1;
  }

  const metrics: TreeCompletenessMetric[] = [
    {
      id: "peoplePlaced",
      label: "People placed",
      done: placeDone,
      total: placeTotal,
      percent:
        placeTotal === 0 && tree.nodes.length === 0
          ? 0
          : ratioPercent(placeDone, Math.max(placeTotal, 1)),
    },
    {
      id: "photosOnTree",
      label: "Photos on tree",
      done: photoDone,
      total: photoTotal,
      percent: photoTotal === 0 ? 0 : ratioPercent(photoDone, photoTotal),
    },
    {
      id: "parentsFilled",
      label: "Parents filled",
      done: parentDone,
      total: parentTotal,
      percent: parentTotal === 0 ? 0 : ratioPercent(parentDone, parentTotal),
    },
    {
      id: "partnersFilled",
      label: "Partners filled",
      done: partnerDone,
      total: partnerTotal,
      percent: partnerTotal === 0 ? 0 : ratioPercent(partnerDone, partnerTotal),
    },
  ];

  // Overall: average of metrics that have something to measure; empty tree = 0.
  let percent = 0;
  if (tree.nodes.length === 0 && peopleCount === 0) {
    percent = 0;
  } else if (tree.nodes.length === 0) {
    percent = ratioPercent(0, Math.max(peopleCount, 1));
  } else {
    const active = metrics.filter((m) => {
      if (m.id === "peoplePlaced") return peopleCount > 0 || m.done > 0;
      if (m.id === "photosOnTree") return m.total > 0;
      if (m.id === "parentsFilled") return m.total > 0;
      if (m.id === "partnersFilled") return m.total > 0;
      return false;
    });
    if (active.length === 0) {
      percent = Math.min(40, tree.nodes.length * 8);
    } else {
      percent = Math.round(
        active.reduce((sum, m) => sum + m.percent, 0) / active.length,
      );
    }
  }

  const badges = computeBadges(tree, maps, hasPhotoByPersonId);
  const nextAction = pickNextAction(input, maps);

  // Soft ceiling: if next action is invite and metrics look full, nudge to 100.
  if (
    nextAction.kind === "invite_family" &&
    metrics.every((m) => m.total === 0 || m.percent >= 100) &&
    tree.nodes.length > 0
  ) {
    percent = 100;
  }

  if (nextAction.kind === "all_done") {
    percent = 100;
  }

  return {
    percent: Math.max(0, Math.min(100, percent)),
    metrics,
    badges,
    earnedBadgeIds: badges.filter((b) => b.earned).map((b) => b.id),
    nextAction,
    encouragement: treeCompletenessEncouragement(percent),
  };
}
