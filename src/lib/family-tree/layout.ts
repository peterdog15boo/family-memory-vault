/**
 * Family-tree visual layout — generations, partner clustering, curved edges.
 * Positions and edge geometry are derived only from stored relationships
 * (never invents links). Generation ranks are recomputed from the same edges.
 */

import type { FamilyTreeRelationType } from "@/lib/db/schema";
import { inferredCoParentPairs } from "@/lib/family-tree/genealogy-iq";
import { edgeLabelForRelation } from "@/lib/family-tree/relations";
import { assignGenerationRanks } from "@/lib/family-tree/types";

export type LayoutGraphNode = {
  id: string;
  /** Hint only — layout recomputes generations from edges. */
  generation?: number;
  label: string;
};

export type LayoutGraphEdge = {
  fromNodeId: string;
  toNodeId: string;
  type: FamilyTreeRelationType;
};

export type LaidOutNode = {
  id: string;
  x: number;
  y: number;
  generation: number;
};

export type LaidOutEdge = {
  id: string;
  type: FamilyTreeRelationType;
  fromId: string;
  toId: string;
  /** SVG path `d` in canvas coordinates (node centers). */
  path: string;
  /** Midpoint label for non-structural / extended links. */
  label?: string;
  labelX?: number;
  labelY?: number;
  /** Softer stroke for cousin / in-law / other links. */
  emphasis?: "structure" | "relation";
};

export type GhostParentSlot = {
  id: string;
  /** Child who is missing a parent. */
  childId: string;
  x: number;
  y: number;
  slotIndex: 0 | 1;
};

export type FamilyTreeLayout = {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  ghosts: GhostParentSlot[];
  width: number;
  height: number;
  /** Padding baked into positions. */
  padding: number;
};

export const TREE_LAYOUT = {
  nodeWidth: 100,
  nodeHeight: 118,
  hGap: 36,
  /** Keep spouses visually distinct — never stacked into one cell. */
  partnerGap: 32,
  /** Extra gap between unrelated family clusters on a row. */
  clusterGap: 56,
  vGap: 112,
  padding: 48,
} as const;

function partnerKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function cubicPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

function partnerArc(x1: number, y1: number, x2: number, y2: number): string {
  const midX = (x1 + x2) / 2;
  const lift = Math.min(28, Math.abs(x2 - x1) * 0.22 + 10);
  return `M ${x1} ${y1} Q ${midX} ${y1 - lift}, ${x2} ${y2}`;
}

function relationArc(x1: number, y1: number, x2: number, y2: number): string {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.max(1, Math.hypot(dx, dy));
  const lift = Math.min(36, len * 0.18 + 12);
  const nx = -dy / len;
  const ny = dx / len;
  const cx = midX + nx * lift;
  const cy = midY + ny * lift;
  return `M ${x1} ${y1} Q ${cx} ${cy}, ${x2} ${y2}`;
}

function pathMidpoint(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { x: number; y: number } {
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

/**
 * Pack nodes into a readable tree:
 * - y by generation (recomputed from parent/partner/sibling edges)
 * - partners sit side-by-side as two distinct nodes (never merged)
 * - each spouse sits under their own parents when both bloodlines exist
 * - shared children cluster under the couple midpoint
 * - unrelated clusters get horizontal breathing room
 * - every stored relationship draws a line; none are invented
 */
export function computeFamilyTreeLayout(
  nodes: LayoutGraphNode[],
  edges: LayoutGraphEdge[],
): FamilyTreeLayout {
  const padding = TREE_LAYOUT.padding;
  if (nodes.length === 0) {
    return {
      nodes: [],
      edges: [],
      ghosts: [],
      width: 320,
      height: 240,
      padding,
    };
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const validEdges = edges.filter(
    (e) => byId.has(e.fromNodeId) && byId.has(e.toNodeId),
  );

  const parentsByChild = new Map<string, string[]>();
  const childrenByParent = new Map<string, string[]>();
  const partnerOf = new Map<string, string>();
  const siblingAdj = new Map<string, Set<string>>();

  for (const edge of validEdges) {
    if (edge.type === "parent_of") {
      const parents = parentsByChild.get(edge.toNodeId) ?? [];
      parents.push(edge.fromNodeId);
      parentsByChild.set(edge.toNodeId, parents);
      const kids = childrenByParent.get(edge.fromNodeId) ?? [];
      kids.push(edge.toNodeId);
      childrenByParent.set(edge.fromNodeId, kids);
    } else if (edge.type === "partner_of") {
      partnerOf.set(edge.fromNodeId, edge.toNodeId);
      partnerOf.set(edge.toNodeId, edge.fromNodeId);
    } else if (edge.type === "sibling_of") {
      const a = siblingAdj.get(edge.fromNodeId) ?? new Set<string>();
      a.add(edge.toNodeId);
      siblingAdj.set(edge.fromNodeId, a);
      const b = siblingAdj.get(edge.toNodeId) ?? new Set<string>();
      b.add(edge.fromNodeId);
      siblingAdj.set(edge.toNodeId, b);
    }
  }

  // Soft-pair co-parents who share a child but lack a spouse edge yet, so the
  // child still sits under the couple visually (Genealogy IQ layout assist).
  for (const [a, b] of inferredCoParentPairs(validEdges)) {
    if (!partnerOf.has(a) && !partnerOf.has(b)) {
      partnerOf.set(a, b);
      partnerOf.set(b, a);
    }
  }

  const generations = assignGenerationRanks(
    nodes.map((n) => n.id),
    validEdges
      .filter((e) => e.type === "parent_of")
      .map((e) => ({
        fromNodeId: e.fromNodeId,
        toNodeId: e.toNodeId,
      })),
    {
      partnerPairs: validEdges
        .filter((e) => e.type === "partner_of")
        .map((e) => [e.fromNodeId, e.toNodeId] as const),
      siblingPairs: validEdges
        .filter((e) => e.type === "sibling_of")
        .map((e) => [e.fromNodeId, e.toNodeId] as const),
    },
  );

  const maxGen = Math.max(0, ...Object.values(generations), 0);
  const gens: string[][] = Array.from({ length: maxGen + 1 }, () => []);
  for (const n of nodes) {
    const g = Math.max(0, Math.min(maxGen, generations[n.id] ?? 0));
    gens[g]!.push(n.id);
  }

  function parentClusterKey(id: string): string {
    return [...(parentsByChild.get(id) ?? [])].sort().join("+") || `solo:${id}`;
  }

  function blocksRelated(aIds: string[], bIds: string[]): boolean {
    const aParents = new Set(aIds.flatMap((id) => parentsByChild.get(id) ?? []));
    const bParents = new Set(bIds.flatMap((id) => parentsByChild.get(id) ?? []));
    for (const p of aParents) {
      if (bParents.has(p)) return true;
      for (const q of bParents) {
        if (siblingAdj.get(p)?.has(q)) return true;
      }
    }
    for (const a of aIds) {
      for (const b of bIds) {
        if (siblingAdj.get(a)?.has(b)) return true;
        if (partnerOf.get(a) === b) return true;
      }
    }
    return false;
  }

  for (let g = 0; g <= maxGen; g++) {
    const ids = gens[g]!;
    const ordered: string[] = [];
    const seen = new Set<string>();

    const siblingGroups = new Map<string, string[]>();
    for (const id of ids) {
      const key = parentClusterKey(id);
      const group = siblingGroups.get(key) ?? [];
      group.push(id);
      siblingGroups.set(key, group);
    }

    // Expand each sibling group into partner-aware units, then order units.
    type Unit = { ids: string[]; sortKey: number };
    const units: Unit[] = [];

    for (const group of siblingGroups.values()) {
      const localSeen = new Set<string>();
      for (const id of group) {
        if (localSeen.has(id) || seen.has(id)) continue;
        const partner = partnerOf.get(id);
        if (partner && ids.includes(partner) && !seen.has(partner)) {
          units.push({ ids: [id, partner], sortKey: 0 });
          localSeen.add(id);
          localSeen.add(partner);
        } else {
          units.push({ ids: [id], sortKey: 0 });
          localSeen.add(id);
        }
      }
    }

    for (const unit of units) {
      const parentXs: number[] = [];
      for (const id of unit.ids) {
        for (const p of parentsByChild.get(id) ?? []) {
          // Parents may not be positioned yet on first pass — use id order.
          parentXs.push([...p].reduce((a, c) => a + c.charCodeAt(0), 0));
        }
      }
      unit.sortKey =
        parentXs.length > 0
          ? parentXs.reduce((a, b) => a + b, 0) / parentXs.length
          : unit.ids[0]!.charCodeAt(0);
    }

    units.sort((a, b) => a.sortKey - b.sortKey || a.ids[0]!.localeCompare(b.ids[0]!));

    // Prefer keeping related units contiguous (cousin branches stay together).
    const placedUnits: Unit[] = [];
    const remaining = [...units];
    while (remaining.length > 0) {
      if (placedUnits.length === 0) {
        placedUnits.push(remaining.shift()!);
        continue;
      }
      const last = placedUnits[placedUnits.length - 1]!;
      let bestIdx = 0;
      let bestScore = -1;
      for (let i = 0; i < remaining.length; i++) {
        const score = blocksRelated(last.ids, remaining[i]!.ids) ? 2 : 0;
        const score2 =
          placedUnits.some((u) => blocksRelated(u.ids, remaining[i]!.ids))
            ? 1
            : 0;
        const total = score + score2;
        if (total > bestScore) {
          bestScore = total;
          bestIdx = i;
        }
      }
      placedUnits.push(remaining.splice(bestIdx, 1)[0]!);
    }

    for (const unit of placedUnits) {
      for (const id of unit.ids) {
        if (seen.has(id)) continue;
        ordered.push(id);
        seen.add(id);
      }
    }

    for (const id of ids) {
      if (!seen.has(id)) ordered.push(id);
    }
    gens[g] = ordered;
  }

  const positions = new Map<string, { x: number; y: number }>();
  const unitWidth = TREE_LAYOUT.nodeWidth + TREE_LAYOUT.hGap;
  const minPartnerSep = TREE_LAYOUT.nodeWidth + TREE_LAYOUT.partnerGap;
  /** Track which sequential units were unrelated for cluster gaps. */
  const clusterBreakAfter = new Set<string>();

  function partnerUnitsInOrder(ids: string[]): string[][] {
    const units: string[][] = [];
    let i = 0;
    while (i < ids.length) {
      const id = ids[i]!;
      const partner = partnerOf.get(id);
      if (partner && ids[i + 1] === partner) {
        units.push([id, partner]);
        i += 2;
      } else {
        units.push([id]);
        i += 1;
      }
    }
    return units;
  }

  function midXOfNodes(ids: string[]): number | null {
    const xs = ids
      .map((id) => positions.get(id)?.x)
      .filter((n): n is number => n != null);
    if (xs.length === 0) return null;
    return (
      xs.reduce((a, b) => a + b, 0) / xs.length + TREE_LAYOUT.nodeWidth / 2
    );
  }

  function shiftUnit(unit: string[], dx: number) {
    if (dx === 0) return;
    for (const id of unit) {
      const pos = positions.get(id);
      if (!pos) continue;
      positions.set(id, { x: pos.x + dx, y: pos.y });
    }
  }

  /**
   * Place a spouse couple as two distinct nodes: each under their own parents
   * when possible, never collapsed into one overlapping cell.
   */
  function placeCoupleUnderParents(leftId: string, rightId: string) {
    const leftPos = positions.get(leftId);
    const rightPos = positions.get(rightId);
    if (!leftPos || !rightPos) return;
    const y = leftPos.y;

    const leftParentMid = midXOfNodes(parentsByChild.get(leftId) ?? []);
    const rightParentMid = midXOfNodes(parentsByChild.get(rightId) ?? []);

    let leftCenter =
      leftParentMid ?? leftPos.x + TREE_LAYOUT.nodeWidth / 2;
    let rightCenter =
      rightParentMid ?? rightPos.x + TREE_LAYOUT.nodeWidth / 2;

    if (rightCenter - leftCenter < minPartnerSep) {
      const mid = (leftCenter + rightCenter) / 2;
      leftCenter = mid - minPartnerSep / 2;
      rightCenter = mid + minPartnerSep / 2;
    }

    positions.set(leftId, {
      x: leftCenter - TREE_LAYOUT.nodeWidth / 2,
      y,
    });
    positions.set(rightId, {
      x: rightCenter - TREE_LAYOUT.nodeWidth / 2,
      y,
    });
  }

  function placeSingleUnderParents(id: string) {
    const pos = positions.get(id);
    if (!pos) return;
    const parentMid = midXOfNodes(parentsByChild.get(id) ?? []);
    if (parentMid == null) return;
    positions.set(id, {
      x: parentMid - TREE_LAYOUT.nodeWidth / 2,
      y: pos.y,
    });
  }

  for (let g = 0; g <= maxGen; g++) {
    const ids = gens[g]!;
    const units = partnerUnitsInOrder(ids);
    for (let u = 0; u < units.length - 1; u++) {
      if (!blocksRelated(units[u]!, units[u + 1]!)) {
        clusterBreakAfter.add(units[u]![units[u]!.length - 1]!);
      }
    }

    let x = 0;
    for (const unit of units) {
      const y = g * (TREE_LAYOUT.nodeHeight + TREE_LAYOUT.vGap);
      if (unit.length === 2) {
        const [a, b] = unit;
        positions.set(a!, { x, y });
        positions.set(b!, {
          x: x + TREE_LAYOUT.nodeWidth + TREE_LAYOUT.partnerGap,
          y,
        });
        x +=
          TREE_LAYOUT.nodeWidth * 2 +
          TREE_LAYOUT.partnerGap +
          TREE_LAYOUT.hGap;
        if (clusterBreakAfter.has(b!)) x += TREE_LAYOUT.clusterGap;
      } else {
        const id = unit[0]!;
        positions.set(id, { x, y });
        x += unitWidth;
        if (clusterBreakAfter.has(id)) x += TREE_LAYOUT.clusterGap;
      }
    }
  }

  // Align each generation: couples stay atomic; spouses under their own parents.
  for (let pass = 0; pass < 2; pass++) {
    for (let g = 1; g <= maxGen; g++) {
      for (const unit of partnerUnitsInOrder(gens[g]!)) {
        if (unit.length === 2) {
          placeCoupleUnderParents(unit[0]!, unit[1]!);
        } else if (unit[0]) {
          placeSingleUnderParents(unit[0]);
        }
      }
    }

    // Pull parent couples above their children (maternal / paternal branches).
    for (let g = maxGen - 1; g >= 0; g--) {
      for (const unit of partnerUnitsInOrder(gens[g]!)) {
        const childIds = new Set<string>();
        for (const id of unit) {
          for (const childId of childrenByParent.get(id) ?? []) {
            childIds.add(childId);
          }
        }
        if (childIds.size === 0) continue;
        const kidsMid = midXOfNodes([...childIds]);
        if (kidsMid == null) continue;
        const unitLeft = positions.get(unit[0]!)?.x;
        const unitRightId = unit[unit.length - 1]!;
        const unitRight = positions.get(unitRightId)?.x;
        if (unitLeft == null || unitRight == null) continue;
        const unitMid =
          (unitLeft + unitRight + TREE_LAYOUT.nodeWidth) / 2;
        shiftUnit(unit, kidsMid - unitMid);
      }
    }
  }

  // Final safety: same-row nodes must not overlap into a "merged" cell.
  for (let g = 0; g <= maxGen; g++) {
    const ids = [...gens[g]!].sort(
      (a, b) => (positions.get(a)?.x ?? 0) - (positions.get(b)?.x ?? 0),
    );
    for (let i = 1; i < ids.length; i++) {
      const prev = positions.get(ids[i - 1]!);
      const cur = positions.get(ids[i]!);
      if (!prev || !cur) continue;
      const minLeft = prev.x + TREE_LAYOUT.nodeWidth + TREE_LAYOUT.partnerGap;
      if (cur.x < minLeft) {
        positions.set(ids[i]!, { x: minLeft, y: cur.y });
      }
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pos of positions.values()) {
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + TREE_LAYOUT.nodeWidth);
    maxY = Math.max(maxY, pos.y + TREE_LAYOUT.nodeHeight);
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 320;
    maxY = 240;
  }

  const laidNodes: LaidOutNode[] = [];
  for (const n of nodes) {
    const pos = positions.get(n.id);
    if (!pos) continue;
    laidNodes.push({
      id: n.id,
      x: pos.x - minX + padding,
      y: pos.y - minY + padding,
      generation: generations[n.id] ?? 0,
    });
  }
  const posById = new Map(laidNodes.map((n) => [n.id, n]));

  function rebuildEdgeGeometry(edge: LaidOutEdge) {
    const from = posById.get(edge.fromId)!;
    const to = posById.get(edge.toId)!;
    const fx = from.x + TREE_LAYOUT.nodeWidth / 2;
    const tx = to.x + TREE_LAYOUT.nodeWidth / 2;

    if (edge.type === "partner_of") {
      const fy = from.y + TREE_LAYOUT.nodeHeight * 0.42;
      const ty = to.y + TREE_LAYOUT.nodeHeight * 0.42;
      edge.path = partnerArc(fx, fy, tx, ty);
      const mid = pathMidpoint(fx, fy - 14, tx, ty - 14);
      edge.labelX = mid.x;
      edge.labelY = mid.y;
      return;
    }

    if (edge.type === "parent_of") {
      const fy = from.y + TREE_LAYOUT.nodeHeight;
      const ty = to.y;
      edge.path = cubicPath(fx, fy, tx, ty);
      return;
    }

    const fy = from.y + TREE_LAYOUT.nodeHeight * 0.42;
    const ty = to.y + TREE_LAYOUT.nodeHeight * 0.42;
    edge.path = relationArc(fx, fy, tx, ty);
    const mid = pathMidpoint(fx, fy, tx, ty);
    edge.labelX = mid.x;
    edge.labelY = mid.y - 8;
  }

  const laidEdges: LaidOutEdge[] = [];
  const seenEdgeIds = new Set<string>();

  for (const edge of validEdges) {
    const from = posById.get(edge.fromNodeId);
    const to = posById.get(edge.toNodeId);
    if (!from || !to) continue;

    let id: string;
    if (edge.type === "parent_of") {
      id = `parent:${from.id}->${to.id}`;
    } else if (edge.type === "partner_of") {
      id = `partner:${partnerKey(from.id, to.id)}`;
    } else {
      id = `${edge.type}:${partnerKey(from.id, to.id)}`;
    }
    if (seenEdgeIds.has(id)) continue;
    seenEdgeIds.add(id);

    const laid: LaidOutEdge = {
      id,
      type: edge.type,
      fromId: from.id,
      toId: to.id,
      path: "",
      label:
        edge.type === "parent_of"
          ? undefined
          : edgeLabelForRelation(edge.type),
      emphasis:
        edge.type === "parent_of" || edge.type === "partner_of"
          ? "structure"
          : "relation",
    };
    rebuildEdgeGeometry(laid);
    laidEdges.push(laid);
  }

  const ghosts: GhostParentSlot[] = [];
  for (const node of laidNodes) {
    const parents = parentsByChild.get(node.id) ?? [];
    const missing = Math.max(0, 2 - parents.length);
    for (let i = 0; i < missing; i++) {
      const slotIndex = (parents.length + i === 0 ? 0 : 1) as 0 | 1;
      const offset = slotIndex === 0 ? -56 : 56;
      ghosts.push({
        id: `ghost:${node.id}:${slotIndex}`,
        childId: node.id,
        x: node.x + TREE_LAYOUT.nodeWidth / 2 + offset - 36,
        y: node.y - TREE_LAYOUT.vGap + 12,
        slotIndex,
      });
    }
  }

  let width = maxX - minX + padding * 2;
  let height = maxY - minY + padding * 2;
  for (const g of ghosts) {
    width = Math.max(width, g.x + 72 + padding);
    height = Math.max(height, g.y + 72 + padding);
  }

  const ghostMinY = ghosts.reduce((m, g) => Math.min(m, g.y), Infinity);
  if (Number.isFinite(ghostMinY) && ghostMinY < padding / 2) {
    const shift = padding / 2 - ghostMinY;
    for (const n of laidNodes) n.y += shift;
    for (const g of ghosts) g.y += shift;
    for (const edge of laidEdges) rebuildEdgeGeometry(edge);
    height += shift;
  }

  return {
    nodes: laidNodes,
    edges: laidEdges,
    ghosts,
    width: Math.max(width, 320),
    height: Math.max(height, 280),
    padding,
  };
}

export function treeNodeInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}
