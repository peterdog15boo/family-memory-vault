/**
 * Canonical edge projection — visible connectors from relationship records only.
 *
 * Layout places nodes. This module is the only place that builds graph lines.
 * Soft layout pairs / couple units never invent or replace these connectors.
 */

import type { FamilyTreeRelationType } from "@/lib/db/schema";
import { edgeLabelForRelation } from "@/lib/family-tree/relations";

/** Must stay in sync with TREE_LAYOUT in layout.ts */
const NODE_WIDTH = 100;
const NODE_HEIGHT = 118;

export type CanonicalRelationship = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  type: FamilyTreeRelationType;
};

export type NodePosition = {
  id: string;
  x: number;
  y: number;
};

export type ProjectedConnector = {
  /** Stable render key; includes relationship id so duplicates cannot collapse. */
  id: string;
  relationshipId: string;
  type: FamilyTreeRelationType;
  fromId: string;
  toId: string;
  path: string;
  label?: string;
  labelX?: number;
  labelY?: number;
  emphasis: "structure" | "relation";
};

export type EdgeProjectionVerification = {
  relationshipCount: number;
  renderedEdgeCount: number;
  /** Relationships with no connector (missing node or failed geometry). */
  relationshipsWithoutConnector: string[];
  /** Connectors that somehow lack a relationship id (should always be empty). */
  connectorsWithoutRelationship: string[];
  ok: boolean;
};

function cubicPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

/**
 * Same-generation relation arc (sibling / cousin / in-law).
 * Always bows upward so the stroke and its label clear node photos.
 * Label anchors to the quadratic midpoint of THIS edge — never a nearby chord.
 */
function relationArcGeom(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cardTop: number,
): { path: string; labelX: number; labelY: number } {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.max(1, Math.hypot(dx, dy));
  // Clear the taller card top; longer spans lift a bit more for readability.
  const minLift = midY - (cardTop - 28);
  const lift = Math.max(minLift, Math.min(56, len * 0.16 + 18));
  const cx = midX;
  const cy = midY - lift;
  const path = `M ${x1} ${y1} Q ${cx} ${cy}, ${x2} ${y2}`;

  // Quadratic B(t=0.5) = 1/4 P0 + 1/2 Ctrl + 1/4 P2 — sits on this edge’s stroke.
  const qx = 0.25 * x1 + 0.5 * cx + 0.25 * x2;
  const qy = 0.25 * y1 + 0.5 * cy + 0.25 * y2;
  return {
    path,
    labelX: qx,
    // Nudge further above the stroke so the badge doesn’t cover faces.
    labelY: qy - 12,
  };
}

/**
 * Spouse connector: marriage bar above the couple cards so it never sits
 * under avatars, even when spouses are far apart under separate parents.
 */
export function spouseConnectorPath(
  left: NodePosition,
  right: NodePosition,
): { path: string; labelX: number; labelY: number } {
  const a = left.x <= right.x ? left : right;
  const b = left.x <= right.x ? right : left;
  const ax = a.x + NODE_WIDTH / 2;
  const bx = b.x + NODE_WIDTH / 2;
  const top = Math.min(a.y, b.y) - 22;
  const dropA = a.y + 8;
  const dropB = b.y + 8;
  return {
    path: `M ${ax} ${dropA} L ${ax} ${top} L ${bx} ${top} L ${bx} ${dropB}`,
    labelX: (ax + bx) / 2,
    labelY: top - 10,
  };
}

function parentConnectorPath(
  parent: NodePosition,
  child: NodePosition,
): string {
  const fx = parent.x + NODE_WIDTH / 2;
  const tx = child.x + NODE_WIDTH / 2;
  const fy = parent.y + NODE_HEIGHT;
  const ty = child.y;
  return cubicPath(fx, fy, tx, ty);
}

/**
 * Traditional couple → child fork: each parent drops to a bar under the
 * couple, then a shared stem runs to the child. Overlapping mid→child
 * segments from both parents read as one descent (no invented edges).
 */
export function coupleParentConnectorPath(
  parent: NodePosition,
  spouse: NodePosition,
  child: NodePosition,
): string {
  const left = parent.x <= spouse.x ? parent : spouse;
  const right = parent.x <= spouse.x ? spouse : parent;
  const midX = (left.x + right.x + NODE_WIDTH) / 2;
  const barY = Math.max(left.y, right.y) + NODE_HEIGHT + 18;
  const px = parent.x + NODE_WIDTH / 2;
  const py = parent.y + NODE_HEIGHT;
  const cx = child.x + NODE_WIDTH / 2;
  const cy = child.y;
  // Keep a short vertical into the child so the stem doesn’t hit the card early.
  const stemBottom = Math.max(barY + 8, (barY + cy) / 2);
  return `M ${px} ${py} L ${px} ${barY} L ${midX} ${barY} L ${midX} ${stemBottom} L ${cx} ${cy}`;
}

function extendedConnectorPath(
  from: NodePosition,
  to: NodePosition,
): { path: string; labelX: number; labelY: number } {
  const fx = from.x + NODE_WIDTH / 2;
  const tx = to.x + NODE_WIDTH / 2;
  const fy = from.y + NODE_HEIGHT * 0.42;
  const ty = to.y + NODE_HEIGHT * 0.42;
  const cardTop = Math.min(from.y, to.y);
  return relationArcGeom(fx, fy, tx, ty, cardTop);
}

/**
 * Both people have parent_of links into at least one shared parent that is
 * actually placed on the canvas (a visible parent union / drop).
 */
export function sharedVisibleParents(
  aId: string,
  bId: string,
  parentsOfChild: ReadonlyMap<string, readonly string[]>,
  placedIds: ReadonlySet<string>,
): boolean {
  const parentsA = (parentsOfChild.get(aId) ?? []).filter((id) =>
    placedIds.has(id),
  );
  const parentsB = (parentsOfChild.get(bId) ?? []).filter((id) =>
    placedIds.has(id),
  );
  if (parentsA.length === 0 || parentsB.length === 0) return false;
  const setB = new Set(parentsB);
  return parentsA.some((p) => setB.has(p));
}

/**
 * Render-only: sibling_of is drawn only when same generation row and the
 * pair does NOT already hang from a shared visible parent union.
 * Helene↔Betty keeps a line; Kat↔Donna under Diane+Frank does not.
 */
export function shouldDrawSiblingConnector(
  from: NodePosition,
  to: NodePosition,
  parentsOfChild: ReadonlyMap<string, readonly string[]>,
  placedIds: ReadonlySet<string>,
): boolean {
  const sameGenerationRow = Math.abs(from.y - to.y) < NODE_HEIGHT * 0.55;
  if (!sameGenerationRow) return false;
  if (sharedVisibleParents(from.id, to.id, parentsOfChild, placedIds)) {
    return false;
  }
  return true;
}

/**
 * Project every canonical relationship onto placed nodes.
 * One relationship → at most one connector. Never invents edges.
 */
export function projectRelationshipsToConnectors(
  relationships: readonly CanonicalRelationship[],
  placedNodes: readonly NodePosition[],
): {
  connectors: ProjectedConnector[];
  verification: EdgeProjectionVerification;
} {
  const posById = new Map(placedNodes.map((n) => [n.id, n]));
  const placedIds = new Set(placedNodes.map((n) => n.id));
  const connectors: ProjectedConnector[] = [];
  const relationshipsWithoutConnector: string[] = [];

  const partnerOf = new Map<string, Set<string>>();
  const parentsOfChild = new Map<string, string[]>();
  for (const rel of relationships) {
    if (rel.type === "partner_of") {
      const a = partnerOf.get(rel.fromNodeId) ?? new Set<string>();
      a.add(rel.toNodeId);
      partnerOf.set(rel.fromNodeId, a);
      const b = partnerOf.get(rel.toNodeId) ?? new Set<string>();
      b.add(rel.fromNodeId);
      partnerOf.set(rel.toNodeId, b);
    } else if (rel.type === "parent_of") {
      const list = parentsOfChild.get(rel.toNodeId) ?? [];
      list.push(rel.fromNodeId);
      parentsOfChild.set(rel.toNodeId, list);
    }
  }

  for (const rel of relationships) {
    const from = posById.get(rel.fromNodeId);
    const to = posById.get(rel.toNodeId);
    if (!from || !to) {
      relationshipsWithoutConnector.push(rel.id);
      continue;
    }
    if (rel.fromNodeId === rel.toNodeId) {
      relationshipsWithoutConnector.push(rel.id);
      continue;
    }

    const renderId = `rel:${rel.id}`;
    let path = "";
    let label: string | undefined;
    let labelX: number | undefined;
    let labelY: number | undefined;
    let emphasis: "structure" | "relation" = "relation";

    if (rel.type === "partner_of") {
      const geom = spouseConnectorPath(from, to);
      path = geom.path;
      labelX = geom.labelX;
      labelY = geom.labelY;
      emphasis = "structure";
    } else if (rel.type === "parent_of") {
      // Drop from this parent + a partner who is ALSO a parent of this child
      // (Teresa+Duane Sr for Duane Jr — never Dana unless Dana has parent_of).
      const coParents = parentsOfChild.get(rel.toNodeId) ?? [];
      const coParentPartnerId = [...(partnerOf.get(rel.fromNodeId) ?? [])].find(
        (p) => coParents.includes(p) && posById.has(p),
      );
      const spouse = coParentPartnerId
        ? posById.get(coParentPartnerId)
        : undefined;
      path =
        spouse
          ? coupleParentConnectorPath(from, spouse, to)
          : parentConnectorPath(from, to);
      emphasis = "structure";
    } else if (rel.type === "sibling_of") {
      // Keep sibling_of in data; only draw when it is the structural proof
      // (same row, no shared visible parent drop already on canvas).
      if (
        !shouldDrawSiblingConnector(from, to, parentsOfChild, placedIds)
      ) {
        continue;
      }
      const geom = extendedConnectorPath(from, to);
      path = geom.path;
      label = edgeLabelForRelation(rel.type);
      labelX = geom.labelX;
      labelY = geom.labelY;
      emphasis = "relation";
    } else {
      // cousin_of and other extended ties stay in the graph for search /
      // structure but are not drawn (they cross the chart and add noise).
      continue;
    }

    if (!path || path.includes("NaN")) {
      relationshipsWithoutConnector.push(rel.id);
      continue;
    }

    connectors.push({
      id: renderId,
      relationshipId: rel.id,
      type: rel.type,
      fromId: from.id,
      toId: to.id,
      path,
      label,
      labelX,
      labelY,
      emphasis,
    });
  }

  const connectorsWithoutRelationship = connectors
    .filter((c) => !c.relationshipId)
    .map((c) => c.id);

  const verification: EdgeProjectionVerification = {
    relationshipCount: relationships.length,
    renderedEdgeCount: connectors.length,
    relationshipsWithoutConnector,
    connectorsWithoutRelationship,
    // Cousin / redundant sibling / extended ties may be stored without a connector.
    ok:
      relationshipsWithoutConnector.length === 0 &&
      connectorsWithoutRelationship.length === 0,
  };

  return { connectors, verification };
}

/** Dev/runtime mismatch log — safe to call on every layout. */
export function logEdgeProjectionVerification(
  verification: EdgeProjectionVerification,
  context: string,
): void {
  if (verification.ok) return;
  console.warn("[family-tree.edge-projection] mismatch", {
    context,
    relationshipCount: verification.relationshipCount,
    renderedEdgeCount: verification.renderedEdgeCount,
    relationshipsWithoutConnector:
      verification.relationshipsWithoutConnector,
    connectorsWithoutRelationship:
      verification.connectorsWithoutRelationship,
  });
}
