/**
 * Family-tree visual layout — generations + Layout IQ node placement.
 * Visible connectors are projected ONLY from canonical relationship records
 * via `projectRelationshipsToConnectors` (never from soft layout pairs).
 */

import type { FamilyTreeRelationType } from "@/lib/db/schema";
import { inferredCoParentPairs } from "@/lib/family-tree/genealogy-iq";
import {
  applyInLawSoftSiblings,
  familyUnitsForGeneration,
  isCoupledOnRow,
  orderGenerationForLayout,
  outerCousinsOf,
  outerRelativesOf,
  outerSiblingsOf,
  suppressSpouseSideCousinBridges,
  type LayoutUnit,
} from "@/lib/family-tree/layout-iq";
import {
  logEdgeProjectionVerification,
  projectRelationshipsToConnectors,
  type EdgeProjectionVerification,
} from "@/lib/family-tree/project-edges";
import { assignGenerationRanks } from "@/lib/family-tree/types";

export type LayoutGraphNode = {
  id: string;
  /** Hint only — layout recomputes generations from edges. */
  generation?: number;
  label: string;
};

export type LayoutGraphEdge = {
  /** Canonical relationship id when available. */
  id?: string;
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
  relationshipId?: string;
  type: FamilyTreeRelationType;
  fromId: string;
  toId: string;
  path: string;
  label?: string;
  labelX?: number;
  labelY?: number;
  emphasis?: "structure" | "relation";
};

export type GhostParentSlot = {
  id: string;
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
  padding: number;
  edgeVerification: EdgeProjectionVerification;
};

export const TREE_LAYOUT = {
  nodeWidth: 100,
  nodeHeight: 118,
  hGap: 36,
  partnerGap: 32,
  /** Breathing room between unrelated family units (e.g. maternal vs paternal). */
  clusterGap: 96,
  vGap: 112,
  padding: 48,
} as const;

const EMPTY_VERIFICATION: EdgeProjectionVerification = {
  relationshipCount: 0,
  renderedEdgeCount: 0,
  relationshipsWithoutConnector: [],
  connectorsWithoutRelationship: [],
  ok: true,
};

/**
 * Pack nodes into a readable traditional tree:
 * - y by generation (recomputed from parent/partner/sibling edges)
 * - Layout IQ orders each row by atomic family units (spouse pairs never split)
 * - maternal / paternal parent couples are separate units — never one sibling bar
 * - each parent couple sits above its own children
 * - shared children cluster under the couple midpoint
 * - cousins stay on their branch / outer side of the related spouse
 *   (never between a couple, never on the unrelated spouse’s side)
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
      edgeVerification: EMPTY_VERIFICATION,
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
  const cousinAdj = new Map<string, Set<string>>();

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
    } else if (edge.type === "cousin_of") {
      const a = cousinAdj.get(edge.fromNodeId) ?? new Set<string>();
      a.add(edge.toNodeId);
      cousinAdj.set(edge.fromNodeId, a);
      const b = cousinAdj.get(edge.toNodeId) ?? new Set<string>();
      b.add(edge.fromNodeId);
      cousinAdj.set(edge.toNodeId, b);
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

  // Soft-link in-laws onto the spouse's outer side for traditional placement.
  applyInLawSoftSiblings(
    siblingAdj,
    partnerOf,
    validEdges
      .filter(
        (e) =>
          e.type === "sister_in_law_of" || e.type === "brother_in_law_of",
      )
      .map((e) => [e.fromNodeId, e.toNodeId] as const),
  );

  // cousin_of wins over a miswired aunt/uncle bridge on the spouse's parents.
  suppressSpouseSideCousinBridges(
    siblingAdj,
    partnerOf,
    parentsByChild,
    cousinAdj,
  );

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
      cousinPairs: validEdges
        .filter((e) => e.type === "cousin_of")
        .map((e) => [e.fromNodeId, e.toNodeId] as const),
    },
  );

  const maxGen = Math.max(0, ...Object.values(generations), 0);
  const gens: string[][] = Array.from({ length: maxGen + 1 }, () => []);
  for (const n of nodes) {
    const g = Math.max(0, Math.min(maxGen, generations[n.id] ?? 0));
    gens[g]!.push(n.id);
  }

  const layoutIqCtx = {
    partnerOf,
    siblingAdj,
    parentsByChild,
    cousinAdj,
  };

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
        if (cousinAdj.get(a)?.has(b)) return true;
      }
    }
    return false;
  }

  // Layout IQ: traditional left→right order within each generation.
  for (let g = 0; g <= maxGen; g++) {
    gens[g] = orderGenerationForLayout(gens[g]!, layoutIqCtx);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const minPartnerSep = TREE_LAYOUT.nodeWidth + TREE_LAYOUT.partnerGap;

  /** Units in Layout IQ left→right order (couples stay atomic). */
  function unitsForGeneration(ids: string[]): LayoutUnit[] {
    // Re-derive from the already Layout-IQ-ordered person list so spouse
    // adjacency in the flat order matches unit packing.
    const units: LayoutUnit[] = [];
    let i = 0;
    while (i < ids.length) {
      const id = ids[i]!;
      const partner = partnerOf.get(id);
      if (partner && ids[i + 1] === partner) {
        units.push({ ids: [id, partner], isCouple: true });
        i += 2;
      } else {
        units.push({ ids: [id], isCouple: false });
        i += 1;
      }
    }
    // Fallback if order somehow broke couples — never invent links, just regroup.
    if (
      units.some(
        (u) =>
          u.ids.length === 1 &&
          partnerOf.has(u.ids[0]!) &&
          ids.includes(partnerOf.get(u.ids[0]!)!),
      )
    ) {
      return familyUnitsForGeneration(ids, layoutIqCtx);
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

  function unitWidth(unit: LayoutUnit): number {
    if (unit.isCouple && unit.ids.length === 2) {
      return TREE_LAYOUT.nodeWidth * 2 + TREE_LAYOUT.partnerGap;
    }
    return TREE_LAYOUT.nodeWidth;
  }

  function unitBounds(
    unit: LayoutUnit,
  ): { left: number; right: number; mid: number } | null {
    let left = Infinity;
    let right = -Infinity;
    for (const id of unit.ids) {
      const pos = positions.get(id);
      if (!pos) continue;
      left = Math.min(left, pos.x);
      right = Math.max(right, pos.x + TREE_LAYOUT.nodeWidth);
    }
    if (!Number.isFinite(left)) return null;
    return { left, right, mid: (left + right) / 2 };
  }

  function unitMidX(unit: LayoutUnit): number | null {
    return unitBounds(unit)?.mid ?? null;
  }

  function shiftUnit(unit: LayoutUnit, dx: number) {
    if (dx === 0) return;
    for (const id of unit.ids) {
      const pos = positions.get(id);
      if (!pos) continue;
      positions.set(id, { x: pos.x + dx, y: pos.y });
    }
  }

  function placeUnitAt(unit: LayoutUnit, leftX: number, y: number) {
    if (unit.isCouple && unit.ids.length === 2) {
      const [a, b] = unit.ids;
      positions.set(a!, { x: leftX, y });
      positions.set(b!, {
        x: leftX + TREE_LAYOUT.nodeWidth + TREE_LAYOUT.partnerGap,
        y,
      });
      return;
    }
    positions.set(unit.ids[0]!, { x: leftX, y });
  }

  function gapBetweenUnits(a: LayoutUnit, b: LayoutUnit): number {
    if (blocksRelated([...a.ids], [...b.ids])) return TREE_LAYOUT.hGap;
    return TREE_LAYOUT.hGap + TREE_LAYOUT.clusterGap;
  }

  /**
   * Pack units left→right as atomic blocks. Couples never split; unrelated
   * maternal/paternal units get an extra cluster gap (no giant sibling bar).
   */
  function packUnits(units: LayoutUnit[], y: number, startX = 0): void {
    let x = startX;
    for (let i = 0; i < units.length; i++) {
      const unit = units[i]!;
      placeUnitAt(unit, x, y);
      x += unitWidth(unit);
      if (i < units.length - 1) {
        x += gapBetweenUnits(unit, units[i + 1]!);
      }
    }
  }

  /**
   * Resolve overlaps by shifting whole units right — never break a couple.
   * Gapped spouse pairs (seated under different parent clusters) are NOT a
   * solid slab: colliding with the empty middle must not shove relatives onto
   * the far spouse’s flank.
   */
  function resolveUnitOverlaps(units: LayoutUnit[]): void {
    type Seg = { left: number; right: number; ids: string[] };
    const segs: Seg[] = [];
    for (const unit of units) {
      if (unit.isCouple && unit.ids.length === 2) {
        const [a, b] = unit.ids as [string, string];
        const pa = positions.get(a);
        const pb = positions.get(b);
        if (!pa || !pb) continue;
        const spread = Math.abs(pa.x - pb.x);
        const tight = TREE_LAYOUT.nodeWidth + TREE_LAYOUT.partnerGap + 2;
        if (spread > tight) {
          segs.push({
            left: pa.x,
            right: pa.x + TREE_LAYOUT.nodeWidth,
            ids: [a],
          });
          segs.push({
            left: pb.x,
            right: pb.x + TREE_LAYOUT.nodeWidth,
            ids: [b],
          });
          continue;
        }
      }
      const bounds = unitBounds(unit);
      if (!bounds) continue;
      segs.push({
        left: bounds.left,
        right: bounds.right,
        ids: [...unit.ids],
      });
    }

    segs.sort((a, b) => a.left - b.left || a.right - b.right);
    for (let i = 1; i < segs.length; i++) {
      const prev = segs[i - 1]!;
      const cur = segs[i]!;
      const minLeft = prev.right + TREE_LAYOUT.hGap;
      if (cur.left < minLeft) {
        const dx = minLeft - cur.left;
        for (const id of cur.ids) {
          const pos = positions.get(id);
          if (!pos) continue;
          positions.set(id, { x: pos.x + dx, y: pos.y });
        }
        cur.left += dx;
        cur.right += dx;
      }
    }
  }

  /**
   * Place a spouse couple under their own parents when possible.
   * Jeff under Jeff's parents, Kathy under Kathy's — never a merged cell.
   */
  function placeCoupleUnderParents(unit: LayoutUnit) {
    if (!unit.isCouple || unit.ids.length !== 2) return;
    const [idA, idB] = unit.ids as [string, string];
    const posA = positions.get(idA);
    const posB = positions.get(idB);
    if (!posA || !posB) return;
    const y = posA.y;

    const parentsA = midXOfNodes(parentsByChild.get(idA) ?? []);
    const parentsB = midXOfNodes(parentsByChild.get(idB) ?? []);

    let leftId = idA;
    let rightId = idB;
    let leftCenter = parentsA ?? posA.x + TREE_LAYOUT.nodeWidth / 2;
    let rightCenter = parentsB ?? posB.x + TREE_LAYOUT.nodeWidth / 2;

    if (parentsA != null && parentsB != null) {
      if (parentsA <= parentsB) {
        leftId = idA;
        rightId = idB;
        leftCenter = parentsA;
        rightCenter = parentsB;
      } else {
        leftId = idB;
        rightId = idA;
        leftCenter = parentsB;
        rightCenter = parentsA;
      }
    } else if (rightCenter < leftCenter) {
      const tmpC = leftCenter;
      leftCenter = rightCenter;
      rightCenter = tmpC;
      const tmpId = leftId;
      leftId = rightId;
      rightId = tmpId;
    }

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

  function placeSingleUnderParents(unit: LayoutUnit) {
    const id = unit.ids[0];
    if (!id) return;
    const pos = positions.get(id);
    if (!pos) return;
    // Explicit cousin_of a married peer: relational flank wins over parent mid
    // (avoids parking Kathy’s cousin under Jeff’s parents).
    const gen = Math.max(0, Math.min(maxGen, generations[id] ?? 0));
    const rowIds = new Set(gens[gen] ?? []);
    for (const peer of cousinAdj.get(id) ?? []) {
      if (isCoupledOnRow(peer, rowIds, partnerOf)) return;
    }
    const parentMid = midXOfNodes(parentsByChild.get(id) ?? []);
    if (parentMid == null) return;
    positions.set(id, {
      x: parentMid - TREE_LAYOUT.nodeWidth / 2,
      y: pos.y,
    });
  }

  function childrenOfUnit(unit: LayoutUnit): string[] {
    const kids = new Set<string>();
    for (const id of unit.ids) {
      for (const childId of childrenByParent.get(id) ?? []) {
        kids.add(childId);
      }
    }
    return [...kids];
  }

  /** Target x for a parent unit: midpoint of its children. */
  function targetMidForUnit(unit: LayoutUnit): number | null {
    return midXOfNodes(childrenOfUnit(unit));
  }

  // Initial pack every generation in Layout IQ unit order.
  const unitsByGen: LayoutUnit[][] = gens.map((ids) => unitsForGeneration(ids));
  for (let g = 0; g <= maxGen; g++) {
    const y = g * (TREE_LAYOUT.nodeHeight + TREE_LAYOUT.vGap);
    packUnits(unitsByGen[g]!, y);
  }

  /**
   * Traditional reflow:
   * 1) Pull each ancestor unit above its children (maternal ≠ paternal).
   * 2) Seat descendants under their parents / couple midpoint.
   * 3) Resolve overlaps as whole units (couples stay side-by-side).
   */
  for (let pass = 0; pass < 3; pass++) {
    // Parents → sit above their own kids (separate couple units).
    for (let g = maxGen - 1; g >= 0; g--) {
      const units = unitsByGen[g]!;
      const y = g * (TREE_LAYOUT.nodeHeight + TREE_LAYOUT.vGap);
      const withTargets = units.map((unit, index) => ({
        unit,
        index,
        target: targetMidForUnit(unit),
      }));
      // Sort by child midpoint so Jeff’s parents land over Jeff, Kathy’s over Kathy.
      withTargets.sort((a, b) => {
        if (a.target != null && b.target != null) return a.target - b.target;
        if (a.target != null) return -1;
        if (b.target != null) return 1;
        return a.index - b.index;
      });
      const ordered = withTargets.map((t) => t.unit);
      unitsByGen[g] = ordered;

      // Place each unit centered on its children when known; else sequential.
      for (let i = 0; i < ordered.length; i++) {
        const unit = ordered[i]!;
        const prev = ordered[i - 1];
        const width = unitWidth(unit);
        const target = withTargets[i]!.target;
        let leftX = target != null ? target - width / 2 : 0;
        if (prev) {
          const prevBounds = unitBounds(prev);
          if (prevBounds) {
            leftX = Math.max(
              leftX,
              prevBounds.right + gapBetweenUnits(prev, unit),
            );
          }
        }
        placeUnitAt(unit, leftX, y);
      }
      resolveUnitOverlaps(ordered);
    }

    // Children → under parents / couple.
    for (let g = 1; g <= maxGen; g++) {
      for (const unit of unitsByGen[g]!) {
        if (unit.isCouple) placeCoupleUnderParents(unit);
        else placeSingleUnderParents(unit);
      }
      resolveUnitOverlaps(unitsByGen[g]!);
    }
  }

  /**
   * Pin unmarried blood siblings and cousins to each spouse's outer side
   * (never between spouses, never pulling another couple apart).
   */
  function snapSiblingsToOuterSides() {
    const idSetByGen = gens.map((ids) => new Set(ids));
    for (let g = 0; g <= maxGen; g++) {
      const ids = gens[g]!;
      const idSet = idSetByGen[g]!;
      const handled = new Set<string>();
      const y = g * (TREE_LAYOUT.nodeHeight + TREE_LAYOUT.vGap);

      for (const unit of unitsByGen[g]!) {
        if (!unit.isCouple || unit.ids.length !== 2) continue;
        const [a, b] = unit.ids as [string, string];
        handled.add(a);
        handled.add(b);
        const aPos = positions.get(a);
        const bPos = positions.get(b);
        if (!aPos || !bPos) continue;

        const leftId = aPos.x <= bPos.x ? a : b;
        const rightId = aPos.x <= bPos.x ? b : a;
        const leftPos = positions.get(leftId)!;
        const rightPos = positions.get(rightId)!;
        const exclude = new Set([leftId, rightId]);

        const leftSibs = outerSiblingsOf(
          leftId,
          idSet,
          layoutIqCtx,
          exclude,
        ).filter((s) => !handled.has(s));
        const leftCousins = outerCousinsOf(
          leftId,
          idSet,
          layoutIqCtx,
          exclude,
        ).filter(
          (s) =>
            !handled.has(s) &&
            !leftSibs.includes(s),
        );
        const rightSibs = outerSiblingsOf(
          rightId,
          idSet,
          layoutIqCtx,
          exclude,
        ).filter(
          (s) =>
            !handled.has(s) &&
            !leftSibs.includes(s) &&
            !leftCousins.includes(s),
        );
        const rightCousins = outerCousinsOf(
          rightId,
          idSet,
          layoutIqCtx,
          exclude,
        ).filter(
          (s) =>
            !handled.has(s) &&
            !leftSibs.includes(s) &&
            !leftCousins.includes(s) &&
            !rightSibs.includes(s),
        );

        for (const s of [
          ...leftSibs,
          ...leftCousins,
          ...rightSibs,
          ...rightCousins,
        ]) {
          handled.add(s);
        }

        // Left flank: siblings adjacent to spouse, cousins further out.
        // → … cousins | siblings | leftSpouse | rightSpouse …
        let cursor = leftPos.x;
        for (let i = leftSibs.length - 1; i >= 0; i--) {
          cursor -= TREE_LAYOUT.nodeWidth + TREE_LAYOUT.hGap;
          positions.set(leftSibs[i]!, { x: cursor, y: leftPos.y });
        }
        for (let i = leftCousins.length - 1; i >= 0; i--) {
          cursor -= TREE_LAYOUT.nodeWidth + TREE_LAYOUT.hGap;
          positions.set(leftCousins[i]!, { x: cursor, y: leftPos.y });
        }

        // Right flank: siblings then cousins outward.
        cursor = rightPos.x + TREE_LAYOUT.nodeWidth + TREE_LAYOUT.hGap;
        for (const sib of rightSibs) {
          positions.set(sib, { x: cursor, y: rightPos.y });
          cursor += TREE_LAYOUT.nodeWidth + TREE_LAYOUT.hGap;
        }
        for (const cousin of rightCousins) {
          positions.set(cousin, { x: cursor, y: rightPos.y });
          cursor += TREE_LAYOUT.nodeWidth + TREE_LAYOUT.hGap;
        }
      }

      const remaining = ids.filter((id) => {
        if (handled.has(id)) return false;
        const sibs = outerRelativesOf(id, idSet, layoutIqCtx, new Set());
        return sibs.some((s) => !handled.has(s));
      });
      for (const seed of remaining) {
        if (handled.has(seed)) continue;
        const cluster = [
          seed,
          ...outerRelativesOf(seed, idSet, layoutIqCtx, new Set([seed])),
        ].filter((id) => !handled.has(id));
        if (cluster.length <= 1) continue;
        cluster.sort((a, b) => ids.indexOf(a) - ids.indexOf(b));
        const anchor = positions.get(cluster[0]!);
        if (!anchor) continue;
        let cursor = anchor.x;
        for (const id of cluster) {
          positions.set(id, { x: cursor, y: anchor.y ?? y });
          handled.add(id);
          cursor += TREE_LAYOUT.nodeWidth + TREE_LAYOUT.hGap;
        }
      }

      resolveUnitOverlaps(unitsByGen[g]!);
    }
  }

  snapSiblingsToOuterSides();

  /**
   * Final relational pin: unmarried cousins of a spouse sit on that spouse’s
   * outer flank — outside blood siblings, never between a sibling pair.
   * Cousin parents park beside the subject’s parents (not stacked on them).
   */
  function pinCousinsByRelation() {
    /**
     * Place blood siblings adjacent to the peer, cousins further outward.
     * Left peer:  … cousins | siblings | peer | partner …
     * Right peer: … partner | peer | siblings | cousins …
     */
    function placeFlankStack(
      peerPos: { x: number; y: number },
      peerIsLeft: boolean,
      sibIds: string[],
      cousinIds: string[],
    ) {
      if (peerIsLeft) {
        let cursor = peerPos.x;
        for (let i = sibIds.length - 1; i >= 0; i--) {
          cursor -= TREE_LAYOUT.nodeWidth + TREE_LAYOUT.hGap;
          positions.set(sibIds[i]!, { x: cursor, y: peerPos.y });
        }
        for (let i = cousinIds.length - 1; i >= 0; i--) {
          cursor -= TREE_LAYOUT.nodeWidth + TREE_LAYOUT.hGap;
          positions.set(cousinIds[i]!, { x: cursor, y: peerPos.y });
        }
      } else {
        let cursor = peerPos.x + TREE_LAYOUT.nodeWidth + TREE_LAYOUT.hGap;
        for (const id of sibIds) {
          positions.set(id, { x: cursor, y: peerPos.y });
          cursor += TREE_LAYOUT.nodeWidth + TREE_LAYOUT.hGap;
        }
        for (const id of cousinIds) {
          positions.set(id, { x: cursor, y: peerPos.y });
          cursor += TREE_LAYOUT.nodeWidth + TREE_LAYOUT.hGap;
        }
      }
    }

    function unitContainingIds(ids: string[]): LayoutUnit | null {
      const idSet = new Set(ids);
      for (const units of unitsByGen) {
        for (const unit of units) {
          if (unit.ids.some((id) => idSet.has(id))) return unit;
        }
      }
      return null;
    }

    function boundsOfIds(
      ids: string[],
    ): { left: number; right: number; mid: number } | null {
      let left = Infinity;
      let right = -Infinity;
      for (const id of ids) {
        const pos = positions.get(id);
        if (!pos) continue;
        left = Math.min(left, pos.x);
        right = Math.max(right, pos.x + TREE_LAYOUT.nodeWidth);
      }
      if (!Number.isFinite(left)) return null;
      return { left, right, mid: (left + right) / 2 };
    }

    for (let g = 0; g <= maxGen; g++) {
      const ids = gens[g]!;
      const idSet = new Set(ids);

      const byPeer = new Map<string, string[]>();
      for (const id of ids) {
        if (isCoupledOnRow(id, idSet, partnerOf)) continue;
        for (const peer of cousinAdj.get(id) ?? []) {
          if (!isCoupledOnRow(peer, idSet, partnerOf)) continue;
          const list = byPeer.get(peer) ?? [];
          list.push(id);
          byPeer.set(peer, list);
        }
      }

      for (const [peer, cousins] of byPeer) {
        const partner = partnerOf.get(peer);
        const peerPos = positions.get(peer);
        const partnerPos = partner ? positions.get(partner) : null;
        if (!peerPos || !partner || !partnerPos) continue;

        const peerIsLeft = peerPos.x <= partnerPos.x;
        const exclude = new Set([peer, partner]);
        const sibIds = outerSiblingsOf(
          peer,
          idSet,
          layoutIqCtx,
          exclude,
        ).filter((id) => !cousins.includes(id));
        const cousinIds = [...new Set(cousins)].sort((a, b) =>
          a.localeCompare(b),
        );
        placeFlankStack(peerPos, peerIsLeft, sibIds, cousinIds);
      }

      // Park aunt/uncle couples beside the subject’s parents (not on top).
      const parentGensTouched = new Set<number>();
      for (const [peer, cousins] of byPeer) {
        const partner = partnerOf.get(peer);
        const peerPos = positions.get(peer);
        const partnerPos = partner ? positions.get(partner) : null;
        if (!peerPos || !partner || !partnerPos) continue;
        const peerIsLeft = peerPos.x <= partnerPos.x;
        const peerParentIds = parentsByChild.get(peer) ?? [];
        const peerParentBounds = boundsOfIds(peerParentIds);
        if (!peerParentBounds) continue;

        for (const cousinId of cousins) {
          const parentIds = parentsByChild.get(cousinId) ?? [];
          if (parentIds.length === 0) continue;
          const parentUnit = unitContainingIds(parentIds);
          if (!parentUnit) continue;
          const parentGen = Math.max(
            0,
            Math.min(
              maxGen,
              ...parentIds.map((id) => generations[id] ?? 0),
            ),
          );
          parentGensTouched.add(parentGen);
          const width = unitWidth(parentUnit);
          const gap = TREE_LAYOUT.hGap + TREE_LAYOUT.clusterGap;
          const yParent =
            parentGen * (TREE_LAYOUT.nodeHeight + TREE_LAYOUT.vGap);
          const leftX = peerIsLeft
            ? peerParentBounds.left - gap - width
            : peerParentBounds.right + gap;
          placeUnitAt(parentUnit, leftX, yParent);
        }
      }

      for (const pg of parentGensTouched) {
        resolveUnitOverlaps(unitsByGen[pg]!);
      }

      // Re-assert flank after parent moves, then center parents over cousins.
      for (const [peer, cousins] of byPeer) {
        const partner = partnerOf.get(peer);
        const peerPos = positions.get(peer);
        const partnerPos = partner ? positions.get(partner) : null;
        if (!peerPos || !partner || !partnerPos) continue;
        const peerIsLeft = peerPos.x <= partnerPos.x;
        const exclude = new Set([peer, partner, ...cousins]);
        const sibIds = outerSiblingsOf(peer, idSet, layoutIqCtx, exclude);
        const cousinIds = [...new Set(cousins)].sort((a, b) =>
          a.localeCompare(b),
        );
        placeFlankStack(peerPos, peerIsLeft, sibIds, cousinIds);

        for (const cousinId of cousinIds) {
          const parentIds = parentsByChild.get(cousinId) ?? [];
          if (parentIds.length === 0) continue;
          const parentUnit = unitContainingIds(parentIds);
          const cousinPos = positions.get(cousinId);
          if (!parentUnit || !cousinPos) continue;
          const parentGen = Math.max(
            0,
            Math.min(
              maxGen,
              ...parentIds.map((id) => generations[id] ?? 0),
            ),
          );
          parentGensTouched.add(parentGen);
          const width = unitWidth(parentUnit);
          const yParent =
            parentGen * (TREE_LAYOUT.nodeHeight + TREE_LAYOUT.vGap);
          const cousinMid = cousinPos.x + TREE_LAYOUT.nodeWidth / 2;
          placeUnitAt(parentUnit, cousinMid - width / 2, yParent);
        }
      }

      for (const pg of parentGensTouched) {
        resolveUnitOverlaps(unitsByGen[pg]!);
      }

      resolveUnitOverlaps(unitsByGen[g]!);
    }
  }

  // Sync flat generation order to final unit x order (for diagnostics / snaps).
  for (let g = 0; g <= maxGen; g++) {
    const orderedUnits = [...unitsByGen[g]!].sort(
      (a, b) => (unitMidX(a) ?? 0) - (unitMidX(b) ?? 0),
    );
    unitsByGen[g] = orderedUnits;
    gens[g] = orderedUnits.flatMap((u) => [...u.ids]);
    resolveUnitOverlaps(orderedUnits);
  }

  pinCousinsByRelation();

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
    height += shift;
  }

  // Canonical projection after final node positions (including ghost Y shift).
  const canonical = validEdges.map((edge, index) => ({
    id:
      edge.id?.trim() ||
      `anon:${edge.type}:${edge.fromNodeId}:${edge.toNodeId}:${index}`,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
    type: edge.type,
  }));
  const { connectors, verification } = projectRelationshipsToConnectors(
    canonical,
    laidNodes,
  );
  logEdgeProjectionVerification(verification, "computeFamilyTreeLayout");

  const laidEdges: LaidOutEdge[] = connectors.map((c) => ({
    id: c.id,
    relationshipId: c.relationshipId,
    type: c.type,
    fromId: c.fromId,
    toId: c.toId,
    path: c.path,
    label: c.label,
    labelX: c.labelX,
    labelY: c.labelY,
    emphasis: c.emphasis,
  }));

  return {
    nodes: laidNodes,
    edges: laidEdges,
    ghosts,
    width: Math.max(width, 320),
    height: Math.max(height, 280),
    padding,
    edgeVerification: verification,
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
