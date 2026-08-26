/**
 * Layout correction pass — reflow existing trees with Layout IQ.
 *
 * Positions are never stored in the DB; the relationship graph is the
 * source of truth. This module compares a naive (pre–Layout IQ) packing
 * against the traditional Layout IQ result, logs before/after snapshots,
 * and reports whether a visible reflow was needed.
 *
 * Does not create, update, or delete people or relationships.
 */

import {
  computeFamilyTreeLayout,
  TREE_LAYOUT,
  type FamilyTreeLayout,
  type LaidOutNode,
  type LayoutGraphEdge,
  type LayoutGraphNode,
} from "@/lib/family-tree/layout";
import { assignGenerationRanks } from "@/lib/family-tree/types";

export type LayoutPositionSnapshot = {
  nodeCount: number;
  positions: Record<string, { x: number; y: number; generation: number }>;
};

export type LayoutQualityIssue = {
  kind:
    | "sibling_far_apart"
    | "spouses_not_side_by_side"
    | "parent_not_above_child"
    | "child_not_under_couple";
  message: string;
  nodeIds: string[];
};

export type LayoutCorrectionResult = {
  /** Always the Layout IQ layout — safe to render. */
  layout: FamilyTreeLayout;
  /** True when naive packing differed enough that users would notice a reflow. */
  corrected: boolean;
  issuesBefore: LayoutQualityIssue[];
  issuesAfter: LayoutQualityIssue[];
  before: LayoutPositionSnapshot;
  after: LayoutPositionSnapshot;
  message: string | null;
  /** Node ids unchanged — correction never deletes people. */
  preservedNodeIds: string[];
};

const SIBLING_NEAR =
  TREE_LAYOUT.nodeWidth * 2 + TREE_LAYOUT.hGap + TREE_LAYOUT.partnerGap;

function snapshotOf(layout: FamilyTreeLayout): LayoutPositionSnapshot {
  const positions: LayoutPositionSnapshot["positions"] = {};
  for (const n of layout.nodes) {
    positions[n.id] = { x: n.x, y: n.y, generation: n.generation };
  }
  return { nodeCount: layout.nodes.length, positions };
}

function midX(n: LaidOutNode): number {
  return n.x + TREE_LAYOUT.nodeWidth / 2;
}

/**
 * Assess traditional-layout quality of an already-computed layout.
 */
export function assessLayoutQuality(
  layout: FamilyTreeLayout,
  edges: LayoutGraphEdge[],
): LayoutQualityIssue[] {
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const issues: LayoutQualityIssue[] = [];

  const partnerOf = new Map<string, string>();
  const siblingPairs: Array<[string, string]> = [];
  const parentOf: Array<{ parent: string; child: string }> = [];

  for (const e of edges) {
    if (e.type === "partner_of") {
      partnerOf.set(e.fromNodeId, e.toNodeId);
      partnerOf.set(e.toNodeId, e.fromNodeId);
    } else if (e.type === "sibling_of") {
      siblingPairs.push([e.fromNodeId, e.toNodeId]);
    } else if (e.type === "parent_of") {
      parentOf.push({ parent: e.fromNodeId, child: e.toNodeId });
    }
  }

  const seenPartners = new Set<string>();
  for (const [a, b] of partnerOf) {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seenPartners.has(key)) continue;
    seenPartners.add(key);
    const na = byId.get(a);
    const nb = byId.get(b);
    if (!na || !nb) continue;
    if (na.y !== nb.y) {
      issues.push({
        kind: "spouses_not_side_by_side",
        message: "Spouses are not on the same generation row.",
        nodeIds: [a, b],
      });
    } else if (Math.abs(na.x - nb.x) > SIBLING_NEAR * 1.5) {
      issues.push({
        kind: "spouses_not_side_by_side",
        message: "Spouses are too far apart to read as a couple.",
        nodeIds: [a, b],
      });
    }
  }

  for (const [a, b] of siblingPairs) {
    const na = byId.get(a);
    const nb = byId.get(b);
    if (!na || !nb) continue;
    if (na.generation !== nb.generation) continue;
    if (Math.abs(midX(na) - midX(nb)) > SIBLING_NEAR * 2) {
      issues.push({
        kind: "sibling_far_apart",
        message: "Siblings are stretched across the chart instead of adjacent.",
        nodeIds: [a, b],
      });
    }
  }

  for (const { parent, child } of parentOf) {
    const np = byId.get(parent);
    const nc = byId.get(child);
    if (!np || !nc) continue;
    if (nc.y <= np.y) {
      issues.push({
        kind: "parent_not_above_child",
        message: "Parent is not above their child.",
        nodeIds: [parent, child],
      });
    }
  }

  // Children of a couple should sit near the couple midpoint.
  const kidsByPair = new Map<string, string[]>();
  for (const { parent, child } of parentOf) {
    const spouse = partnerOf.get(parent);
    if (!spouse) continue;
    // Only count when spouse is also a parent of the same child.
    if (
      !parentOf.some((p) => p.parent === spouse && p.child === child)
    ) {
      continue;
    }
    const key = parent < spouse ? `${parent}|${spouse}` : `${spouse}|${parent}`;
    const list = kidsByPair.get(key) ?? [];
    if (!list.includes(child)) list.push(child);
    kidsByPair.set(key, list);
  }
  for (const [key, kids] of kidsByPair) {
    const [a, b] = key.split("|") as [string, string];
    const na = byId.get(a);
    const nb = byId.get(b);
    if (!na || !nb) continue;
    const coupleMid = (midX(na) + midX(nb)) / 2;
    for (const kid of kids) {
      const nk = byId.get(kid);
      if (!nk) continue;
      if (Math.abs(midX(nk) - coupleMid) > TREE_LAYOUT.nodeWidth * 2.5) {
        issues.push({
          kind: "child_not_under_couple",
          message: "Child is not centered under their parents.",
          nodeIds: [a, b, kid],
        });
      }
    }
  }

  return issues;
}

/**
 * Naive generation packing (insertion / id order) — used only as a "before"
 * baseline to detect whether Layout IQ changes placement for existing trees.
 */
export function computeNaiveFamilyTreeLayout(
  nodes: LayoutGraphNode[],
  edges: LayoutGraphEdge[],
): FamilyTreeLayout {
  if (nodes.length === 0) {
    return {
      nodes: [],
      edges: [],
      ghosts: [],
      width: 320,
      height: 240,
      padding: TREE_LAYOUT.padding,
      edgeVerification: {
        relationshipCount: 0,
        renderedEdgeCount: 0,
        relationshipsWithoutConnector: [],
        connectorsWithoutRelationship: [],
        ok: true,
      },
    };
  }

  const parentEdges = edges
    .filter((e) => e.type === "parent_of")
    .map((e) => ({ fromNodeId: e.fromNodeId, toNodeId: e.toNodeId }));
  const generations = assignGenerationRanks(
    nodes.map((n) => n.id),
    parentEdges,
    {
      partnerPairs: edges
        .filter((e) => e.type === "partner_of")
        .map((e) => [e.fromNodeId, e.toNodeId] as const),
      siblingPairs: edges
        .filter((e) => e.type === "sibling_of")
        .map((e) => [e.fromNodeId, e.toNodeId] as const),
    },
  );

  const maxGen = Math.max(0, ...Object.values(generations), 0);
  const gens: string[][] = Array.from({ length: maxGen + 1 }, () => []);
  // Stable but non–Layout-IQ order: original node array order within gen.
  for (const n of nodes) {
    const g = Math.max(0, Math.min(maxGen, generations[n.id] ?? 0));
    gens[g]!.push(n.id);
  }

  const laid: LaidOutNode[] = [];
  let maxX = 0;
  for (let g = 0; g <= maxGen; g++) {
    let x = TREE_LAYOUT.padding;
    const y = TREE_LAYOUT.padding + g * (TREE_LAYOUT.nodeHeight + TREE_LAYOUT.vGap);
    for (const id of gens[g]!) {
      laid.push({ id, x, y, generation: generations[id] ?? 0 });
      x += TREE_LAYOUT.nodeWidth + TREE_LAYOUT.hGap;
      maxX = Math.max(maxX, x);
    }
  }

  return {
    nodes: laid,
    edges: [],
    ghosts: [],
    width: Math.max(320, maxX + TREE_LAYOUT.padding),
    height:
      TREE_LAYOUT.padding * 2 +
      (maxGen + 1) * TREE_LAYOUT.nodeHeight +
      maxGen * TREE_LAYOUT.vGap,
    padding: TREE_LAYOUT.padding,
    edgeVerification: {
      relationshipCount: edges.length,
      renderedEdgeCount: 0,
      relationshipsWithoutConnector: edges.map(
        (_, i) => `naive-unprojected:${i}`,
      ),
      connectorsWithoutRelationship: [],
      ok: false,
    },
  };
}

function positionsDifferMeaningfully(
  before: LayoutPositionSnapshot,
  after: LayoutPositionSnapshot,
): boolean {
  const threshold = TREE_LAYOUT.nodeWidth * 0.75;
  for (const id of Object.keys(after.positions)) {
    const a = after.positions[id];
    const b = before.positions[id];
    if (!a || !b) return true;
    if (Math.hypot(a.x - b.x, a.y - b.y) > threshold) return true;
    if (a.generation !== b.generation) return true;
  }
  return before.nodeCount !== after.nodeCount;
}

/**
 * Reflow a tree from the relationship graph using Layout IQ.
 * Never mutates graph identity — layout only.
 */
export function correctFamilyTreeLayout(
  nodes: LayoutGraphNode[],
  edges: LayoutGraphEdge[],
): LayoutCorrectionResult {
  const preservedNodeIds = nodes.map((n) => n.id);
  const naive = computeNaiveFamilyTreeLayout(nodes, edges);
  const layout = computeFamilyTreeLayout(nodes, edges);

  const before = snapshotOf(naive);
  const after = snapshotOf(layout);
  const issuesBefore = assessLayoutQuality(naive, edges);
  const issuesAfter = assessLayoutQuality(layout, edges);

  const corrected =
    issuesBefore.length > issuesAfter.length ||
    positionsDifferMeaningfully(before, after);

  const message = corrected
    ? "We updated your family tree layout so relatives sit in traditional positions."
    : null;

  console.info("[family-tree.layout-correct]", {
    corrected,
    nodeCount: preservedNodeIds.length,
    issuesBefore: issuesBefore.length,
    issuesAfter: issuesAfter.length,
    before,
    after,
  });

  return {
    layout,
    corrected,
    issuesBefore,
    issuesAfter,
    before,
    after,
    message,
    preservedNodeIds,
  };
}
