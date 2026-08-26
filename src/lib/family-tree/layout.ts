/**
 * Family-tree visual layout — generations, partner clustering, curved edges.
 */

import type { FamilyTreeRelationType } from "@/lib/db/schema";
import { edgeLabelForRelation } from "@/lib/family-tree/relations";

export type LayoutGraphNode = {
  id: string;
  generation: number;
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
  partnerGap: 18,
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
 * Pack nodes into a warm, readable tree:
 * - y by generation
 * - partners sit side-by-side
 * - children cluster under parent midpoints when possible
 * - extended relations draw as labeled soft arcs (no auto-invented links)
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
  const parentsByChild = new Map<string, string[]>();
  const childrenByParent = new Map<string, string[]>();
  const partnerOf = new Map<string, string>();

  for (const edge of edges) {
    if (!byId.has(edge.fromNodeId) || !byId.has(edge.toNodeId)) continue;
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
    }
  }

  const maxGen = Math.max(...nodes.map((n) => n.generation), 0);
  const gens: string[][] = Array.from({ length: maxGen + 1 }, () => []);
  for (const n of nodes) {
    const g = Math.max(0, Math.min(maxGen, n.generation));
    gens[g]!.push(n.id);
  }

  for (let g = 0; g <= maxGen; g++) {
    const ids = gens[g]!;
    const ordered: string[] = [];
    const seen = new Set<string>();

    const siblingGroups = new Map<string, string[]>();
    for (const id of ids) {
      const parents = [...(parentsByChild.get(id) ?? [])].sort().join("+") || id;
      const group = siblingGroups.get(parents) ?? [];
      group.push(id);
      siblingGroups.set(parents, group);
    }

    for (const group of siblingGroups.values()) {
      for (const id of group) {
        if (seen.has(id)) continue;
        ordered.push(id);
        seen.add(id);
        const partner = partnerOf.get(id);
        if (partner && ids.includes(partner) && !seen.has(partner)) {
          ordered.push(partner);
          seen.add(partner);
        }
      }
    }

    for (const id of ids) {
      if (!seen.has(id)) ordered.push(id);
    }
    gens[g] = ordered;
  }

  const positions = new Map<string, { x: number; y: number }>();
  const unitWidth = TREE_LAYOUT.nodeWidth + TREE_LAYOUT.hGap;

  let maxRowWidth = 0;
  for (let g = 0; g <= maxGen; g++) {
    const ids = gens[g]!;
    let x = 0;
    let i = 0;
    while (i < ids.length) {
      const id = ids[i]!;
      const partner = partnerOf.get(id);
      const partnerNext =
        partner && ids[i + 1] === partner ? partner : undefined;

      if (partnerNext) {
        positions.set(id, {
          x,
          y: g * (TREE_LAYOUT.nodeHeight + TREE_LAYOUT.vGap),
        });
        positions.set(partnerNext, {
          x: x + TREE_LAYOUT.nodeWidth + TREE_LAYOUT.partnerGap,
          y: g * (TREE_LAYOUT.nodeHeight + TREE_LAYOUT.vGap),
        });
        x +=
          TREE_LAYOUT.nodeWidth * 2 +
          TREE_LAYOUT.partnerGap +
          TREE_LAYOUT.hGap;
        i += 2;
      } else {
        positions.set(id, {
          x,
          y: g * (TREE_LAYOUT.nodeHeight + TREE_LAYOUT.vGap),
        });
        x += unitWidth;
        i += 1;
      }
    }
    maxRowWidth = Math.max(maxRowWidth, x);
  }

  for (let pass = 0; pass < 2; pass++) {
    for (let g = 1; g <= maxGen; g++) {
      const ids = gens[g]!;
      let start = 0;
      while (start < ids.length) {
        const first = ids[start]!;
        const parentKey = [...(parentsByChild.get(first) ?? [])]
          .sort()
          .join("+");
        let end = start + 1;
        while (end < ids.length) {
          const key = [...(parentsByChild.get(ids[end]!) ?? [])]
            .sort()
            .join("+");
          if (key !== parentKey) break;
          end += 1;
        }

        const cluster = ids.slice(start, end);
        const parents = parentsByChild.get(first) ?? [];
        if (parents.length > 0 && cluster.length > 0) {
          const parentXs = parents
            .map((p) => positions.get(p)?.x)
            .filter((n): n is number => n != null);
          if (parentXs.length > 0) {
            const parentMid =
              parentXs.reduce((a, b) => a + b, 0) / parentXs.length +
              TREE_LAYOUT.nodeWidth / 2;
            const clusterLeft = positions.get(cluster[0]!)!.x;
            const clusterRight =
              positions.get(cluster[cluster.length - 1]!)!.x +
              TREE_LAYOUT.nodeWidth;
            const clusterMid = (clusterLeft + clusterRight) / 2;
            const dx = parentMid - clusterMid;
            for (const id of cluster) {
              const pos = positions.get(id)!;
              positions.set(id, { x: pos.x + dx, y: pos.y });
            }
          }
        }
        start = end;
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
      generation: n.generation,
    });
  }
  const posById = new Map(laidNodes.map((n) => [n.id, n]));

  function rebuildEdgeGeometry(edge: LaidOutEdge) {
    const from = posById.get(edge.fromId)!;
    const to = posById.get(edge.toId)!;
    const fx = from.x + TREE_LAYOUT.nodeWidth / 2;
    const tx = to.x + TREE_LAYOUT.nodeWidth / 2;

    if (edge.type === "partner_of") {
      const fy = from.y + TREE_LAYOUT.nodeWidth / 2;
      const ty = to.y + TREE_LAYOUT.nodeWidth / 2;
      edge.path = partnerArc(fx, fy, tx, ty);
      const mid = pathMidpoint(fx, fy - 14, tx, ty - 14);
      edge.labelX = mid.x;
      edge.labelY = mid.y;
      return;
    }

    if (edge.type === "parent_of") {
      const fy = from.y + TREE_LAYOUT.nodeWidth;
      const ty = to.y;
      edge.path = cubicPath(fx, fy, tx, ty);
      return;
    }

    const fy = from.y + TREE_LAYOUT.nodeWidth / 2;
    const ty = to.y + TREE_LAYOUT.nodeWidth / 2;
    edge.path = relationArc(fx, fy, tx, ty);
    const mid = pathMidpoint(fx, fy, tx, ty);
    edge.labelX = mid.x;
    edge.labelY = mid.y - 8;
  }

  const laidEdges: LaidOutEdge[] = [];
  for (const edge of edges) {
    const from = posById.get(edge.fromNodeId);
    const to = posById.get(edge.toNodeId);
    if (!from || !to) continue;

    if (edge.type === "parent_of") {
      const laid: LaidOutEdge = {
        id: `parent:${from.id}->${to.id}`,
        type: "parent_of",
        fromId: from.id,
        toId: to.id,
        path: "",
        emphasis: "structure",
      };
      rebuildEdgeGeometry(laid);
      laidEdges.push(laid);
      continue;
    }

    if (edge.type === "partner_of") {
      const laid: LaidOutEdge = {
        id: `partner:${partnerKey(from.id, to.id)}`,
        type: "partner_of",
        fromId: from.id,
        toId: to.id,
        path: "",
        label: edgeLabelForRelation("partner_of"),
        emphasis: "structure",
      };
      rebuildEdgeGeometry(laid);
      laidEdges.push(laid);
      continue;
    }

    const laid: LaidOutEdge = {
      id: `${edge.type}:${from.id}->${to.id}`,
      type: edge.type,
      fromId: from.id,
      toId: to.id,
      path: "",
      label: edgeLabelForRelation(edge.type),
      emphasis: "relation",
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

  void maxRowWidth;

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
