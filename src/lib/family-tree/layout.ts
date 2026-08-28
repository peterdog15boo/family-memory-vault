/**
 * Family-tree visual layout — generations + Layout IQ node placement.
 * Visible connectors are projected ONLY from canonical relationship records
 * via `projectRelationshipsToConnectors` (never from soft layout pairs).
 */

import type { FamilyTreeRelationType } from "@/lib/db/schema";
import { inferredCoParentPairs } from "@/lib/family-tree/genealogy-iq";
import {
  addPartnerLink,
  applyInLawSoftSiblings,
  emptyPartnerIndex,
  familyUnitsForGeneration,
  isCoupledOnRow,
  orderGenerationForLayout,
  primaryPartnerOf,
  siblingFlankUnits,
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
 * - focus couple anchors the center generation; flanks expand outward
 * - spouse pairs stay atomic (never split by a cousin)
 * - cousins outer, blood siblings inner on each flank
 * - sibling groups: contiguous blood spine; in-laws dock on free ends
 * - maternal / paternal parent couples sit above their own children by side
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
  /** Multi-partner index — partner_of may repeat per person. */
  const partnersIndex = emptyPartnerIndex();
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
      addPartnerLink(partnersIndex, edge.fromNodeId, edge.toNodeId);
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
    if (!partnersIndex.has(a) && !partnersIndex.has(b)) {
      addPartnerLink(partnersIndex, a, b);
    }
  }

  // Single-partner view for focus / couple heuristics (stable primary).
  const partnerOf = new Map<string, string>();
  for (const id of partnersIndex.keys()) {
    const primary = primaryPartnerOf(id, partnersIndex);
    if (primary) partnerOf.set(id, primary);
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
    const n = unit.ids.length;
    if (n <= 1) return TREE_LAYOUT.nodeWidth;
    return (
      TREE_LAYOUT.nodeWidth * n +
      TREE_LAYOUT.partnerGap * Math.max(0, n - 1)
    );
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
    let x = leftX;
    for (let i = 0; i < unit.ids.length; i++) {
      positions.set(unit.ids[i]!, { x, y });
      x += TREE_LAYOUT.nodeWidth;
      if (i < unit.ids.length - 1) x += TREE_LAYOUT.partnerGap;
    }
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

  /**
   * Traditional focus-centered layout:
   * 1) Anchor the focus couple in generation-center
   * 2) Left flank expands LEFT (cousins outer, married siblings inner)
   * 3) Right flank expands RIGHT
   * 4) Parent unions sit directly above their children on the matching side
   * 5) Spouse pairs stay atomic; ignore prior messy coordinates
   */
  function findFocusCouple(): { leftId: string; rightId: string } | null {
    const partners: Array<[string, string]> = [];
    const seen = new Set<string>();
    for (const [a, b] of partnerOf) {
      if (a > b) continue;
      const key = `${a}|${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      partners.push([a, b]);
    }
    if (partners.length === 0) return null;

    const sharedChildCount = (a: string, b: string) => {
      const kidsA = new Set(childrenByParent.get(a) ?? []);
      return (childrenByParent.get(b) ?? []).filter((id) => kidsA.has(id))
        .length;
    };
    const coupleScore = (a: string, b: string) => {
      const parentsPresent =
        ((parentsByChild.get(a)?.length ?? 0) > 0 ? 1 : 0) +
        ((parentsByChild.get(b)?.length ?? 0) > 0 ? 1 : 0);
      return parentsPresent * 100 + sharedChildCount(a, b);
    };

    partners.sort((p, q) => {
      const diff = coupleScore(q[0], q[1]) - coupleScore(p[0], p[1]);
      if (diff !== 0) return diff;
      return `${p[0]}|${p[1]}`.localeCompare(`${q[0]}|${q[1]}`);
    });

    const [a, b] = partners[0]!;
    const parentsKey = (id: string) =>
      (parentsByChild.get(id) ?? []).slice().sort().join("+") || id;
    const leftId = parentsKey(a) <= parentsKey(b) ? a : b;
    const rightId = leftId === a ? b : a;
    return { leftId, rightId };
  }

  /**
   * Flank units ordered outer → inner toward the focus spouse.
   *
   * Cousins stay outer. Blood siblings pack as one spine with each person’s
   * partners glued to that person (outer free end / owner’s side) — never
   * wedge someone else’s spouse between two blood siblings (esp. Teresa|Donna).
   *
   * Includes structural cousins: children of a parent’s sibling (e.g. David
   * under Betty, Helene’s sister) even without an explicit cousin_of edge.
   */
  function buildFlankUnits(
    anchorId: string,
    gen: number,
    towardLeft: boolean,
  ): LayoutUnit[] {
    const idSet = new Set(gens[gen] ?? []);
    const used = new Set<string>([anchorId]);
    const focusPartner = partnerOf.get(anchorId);
    if (focusPartner) used.add(focusPartner);

    const units: LayoutUnit[] = [];

    function takeCousin(bloodId: string) {
      if (used.has(bloodId) || !idSet.has(bloodId)) return;
      const p = partnerOf.get(bloodId);
      if (
        p &&
        idSet.has(p) &&
        !used.has(p) &&
        partnerOf.get(p) === bloodId
      ) {
        units.push(
          towardLeft
            ? { ids: [p, bloodId], isCouple: true }
            : { ids: [bloodId, p], isCouple: true },
        );
        used.add(bloodId);
        used.add(p);
      } else {
        units.push({ ids: [bloodId], isCouple: false });
        used.add(bloodId);
      }
    }

    /** Kids of parent-siblings (aunts/uncles) on this generation. */
    function auntUncleCousins(): string[] {
      const found = new Set<string>();
      for (const parent of parentsByChild.get(anchorId) ?? []) {
        for (const auntUncle of siblingAdj.get(parent) ?? []) {
          const household = new Set<string>([auntUncle]);
          const spouse = partnerOf.get(auntUncle);
          if (spouse) household.add(spouse);
          for (const adult of household) {
            for (const kid of childrenByParent.get(adult) ?? []) {
              if (!idSet.has(kid) || used.has(kid) || kid === anchorId) continue;
              if (focusPartner && kid === focusPartner) continue;
              found.add(kid);
            }
          }
        }
      }
      return [...found].sort((a, b) => a.localeCompare(b));
    }

    // Outer: explicit cousins, then aunt/uncle kids.
    const cousins = [...(cousinAdj.get(anchorId) ?? [])]
      .filter((id) => idSet.has(id) && !used.has(id))
      .sort((a, b) => a.localeCompare(b));
    for (const c of cousins) takeCousin(c);
    for (const c of auntUncleCousins()) takeCousin(c);

    // Blood siblings: contiguous spine; spouses dock on free ends only.
    const sibs = [...(siblingAdj.get(anchorId) ?? [])]
      .filter((id) => idSet.has(id) && !used.has(id))
      .sort((a, b) => a.localeCompare(b));
    if (sibs.length > 0) {
      const sibUnits = siblingFlankUnits({
        bloodIds: sibs,
        idSet,
        partners: partnersIndex,
        exclude: used,
        towardFocus: towardLeft ? "right" : "left",
      });
      for (const unit of sibUnits) {
        units.push(unit);
        for (const id of unit.ids) used.add(id);
      }
    }

    return units;
  }

  function packRowFixedGap(
    units: LayoutUnit[],
    y: number,
    gap: number,
    startX = 0,
  ): void {
    let x = startX;
    for (let i = 0; i < units.length; i++) {
      const unit = units[i]!;
      placeUnitAt(unit, x, y);
      x += unitWidth(unit);
      if (i < units.length - 1) x += gap;
    }
  }

  /**
   * Center each sibling block on its parent-union midpoint.
   * Never parks the first child on the mid and grows right (that makes
   * kids look like they “come out of” the right spouse).
   */
  function centerUnitsUnderSharedParents(
    units: LayoutUnit[],
    y: number,
    fallbackMid: number,
  ): LayoutUnit[] {
    type Group = {
      key: string;
      units: LayoutUnit[];
      parentMid: number;
    };
    const groupMap = new Map<string, Group>();
    const sequence: Group[] = [];

    for (const unit of units) {
      const parentIds = [
        ...new Set(unit.ids.flatMap((id) => parentsByChild.get(id) ?? [])),
      ].sort();
      const key =
        parentIds.length > 0
          ? parentIds.join("+")
          : `orph:${unit.ids.join("+")}`;
      let group = groupMap.get(key);
      if (!group) {
        group = {
          key,
          units: [],
          parentMid: midXOfNodes(parentIds) ?? fallbackMid,
        };
        groupMap.set(key, group);
        sequence.push(group);
      }
      group.units.push(unit);
    }

    sequence.sort(
      (a, b) => a.parentMid - b.parentMid || a.key.localeCompare(b.key),
    );

    const sibGap = TREE_LAYOUT.hGap;
    for (const group of sequence) {
      let blockW = 0;
      for (let i = 0; i < group.units.length; i++) {
        blockW += unitWidth(group.units[i]!);
        if (i < group.units.length - 1) blockW += sibGap;
      }
      let x = group.parentMid - blockW / 2;
      for (let i = 0; i < group.units.length; i++) {
        placeUnitAt(group.units[i]!, x, y);
        x += unitWidth(group.units[i]!) + sibGap;
      }
    }

    // Separate overlapping parent-union blocks without un-centering kids
    // inside a block (shift whole groups only).
    for (let i = 1; i < sequence.length; i++) {
      const prev = sequence[i - 1]!;
      const cur = sequence[i]!;
      let prevRight = -Infinity;
      for (const u of prev.units) {
        const b = unitBounds(u);
        if (b) prevRight = Math.max(prevRight, b.right);
      }
      let curLeft = Infinity;
      for (const u of cur.units) {
        const b = unitBounds(u);
        if (b) curLeft = Math.min(curLeft, b.left);
      }
      if (!Number.isFinite(prevRight) || !Number.isFinite(curLeft)) continue;
      const minGap = TREE_LAYOUT.hGap + TREE_LAYOUT.clusterGap;
      if (curLeft < prevRight + minGap) {
        const dx = prevRight + minGap - curLeft;
        for (const u of cur.units) shiftUnit(u, dx);
      }
    }

    return sequence.flatMap((g) => g.units);
  }

  /** True if unit is (or partners) a sibling of a focus parent's household. */
  function unitAttachesBesideFocusParent(
    unit: LayoutUnit,
    focusSpouseId: string,
  ): boolean {
    const focusParents = parentsByChild.get(focusSpouseId) ?? [];
    for (const parent of focusParents) {
      for (const id of unit.ids) {
        if (siblingAdj.get(parent)?.has(id)) return true;
        const spouse = partnerOf.get(id);
        if (spouse && siblingAdj.get(parent)?.has(spouse)) return true;
      }
    }
    return false;
  }

  function sideForParentUnit(
    unit: LayoutUnit,
    leftMemberIds: Set<string>,
    rightMemberIds: Set<string>,
    focusLeftId: string,
    focusRightId: string,
  ): "left" | "right" | "unknown" {
    if (
      unit.ids.some((id) =>
        (parentsByChild.get(focusLeftId) ?? []).includes(id),
      )
    ) {
      return "left";
    }
    if (
      unit.ids.some((id) =>
        (parentsByChild.get(focusRightId) ?? []).includes(id),
      )
    ) {
      return "right";
    }

    // Aunt/uncle couple attached to a focus parent inherits that parent's side
    // (Betty+Ralph beside Helene → right), even before their kids are placed.
    if (unitAttachesBesideFocusParent(unit, focusLeftId)) return "left";
    if (unitAttachesBesideFocusParent(unit, focusRightId)) return "right";

    let leftScore = 0;
    let rightScore = 0;
    for (const mid of leftMemberIds) {
      if ((parentsByChild.get(mid) ?? []).some((p) => unit.ids.includes(p))) {
        leftScore += 3;
      }
    }
    for (const mid of rightMemberIds) {
      if ((parentsByChild.get(mid) ?? []).some((p) => unit.ids.includes(p))) {
        rightScore += 3;
      }
    }
    for (const kid of childrenOfUnit(unit)) {
      if (leftMemberIds.has(kid)) leftScore += 2;
      if (rightMemberIds.has(kid)) rightScore += 2;
    }
    if (leftScore > rightScore) return "left";
    if (rightScore > leftScore) return "right";
    return "unknown";
  }

  /** Side for a leftover focus-gen person via their parents' attachment. */
  function sideForFocusPerson(
    personId: string,
    focusLeftId: string,
    focusRightId: string,
  ): "left" | "right" | "unknown" {
    const parents = parentsByChild.get(personId) ?? [];
    if (parents.length === 0) return "unknown";
    const fakeUnit: LayoutUnit = {
      ids: parents.length >= 2 ? [parents[0]!, parents[1]!] : [parents[0]!],
      isCouple: parents.length >= 2,
    };
    return sideForParentUnit(
      fakeUnit,
      new Set(),
      new Set(),
      focusLeftId,
      focusRightId,
    );
  }

  const unitsByGen: LayoutUnit[][] = Array.from(
    { length: maxGen + 1 },
    () => [],
  );
  const unitGap = TREE_LAYOUT.hGap + TREE_LAYOUT.clusterGap;
  /** Generations at/above this keep overlap resolve; below stay centered blocks. */
  let focusGenForSync = 0;

  function layoutWithoutFocus() {
    for (let g = 0; g <= maxGen; g++) {
      const y = g * (TREE_LAYOUT.nodeHeight + TREE_LAYOUT.vGap);
      const units = familyUnitsForGeneration(gens[g]!, layoutIqCtx);
      packUnits(units, y);
      unitsByGen[g] = units;
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let g = maxGen - 1; g >= 0; g--) {
        const units = unitsByGen[g]!;
        const y = g * (TREE_LAYOUT.nodeHeight + TREE_LAYOUT.vGap);
        const withTargets = units.map((unit, index) => ({
          unit,
          index,
          target: targetMidForUnit(unit),
        }));
        withTargets.sort((a, b) => {
          if (a.target != null && b.target != null) return a.target - b.target;
          if (a.target != null) return -1;
          if (b.target != null) return 1;
          return a.index - b.index;
        });
        const ordered = withTargets.map((t) => t.unit);
        unitsByGen[g] = ordered;
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
      for (let g = 1; g <= maxGen; g++) {
        const y = g * (TREE_LAYOUT.nodeHeight + TREE_LAYOUT.vGap);
        const units = unitsByGen[g]!;
        const midFallback =
          units.length > 0
            ? (unitMidX(units[0]!) ?? 0)
            : 0;
        unitsByGen[g] = centerUnitsUnderSharedParents(
          units,
          y,
          midFallback,
        );
      }
    }
  }

  const focus = findFocusCouple();
  if (!focus) {
    layoutWithoutFocus();
    focusGenForSync = 0;
  } else {
    const { leftId, rightId } = focus;
    const focusGen = Math.max(
      generations[leftId] ?? 0,
      generations[rightId] ?? 0,
    );
    focusGenForSync = focusGen;
    const focusUnit: LayoutUnit = {
      ids: [leftId, rightId],
      isCouple: true,
    };

    const leftFlank = buildFlankUnits(leftId, focusGen, true);
    const rightFlank = buildFlankUnits(rightId, focusGen, false);

    const claimed = new Set<string>([
      ...focusUnit.ids,
      ...leftFlank.flatMap((u) => [...u.ids]),
      ...rightFlank.flatMap((u) => [...u.ids]),
    ]);
    const leftLeftovers: LayoutUnit[] = [];
    const rightLeftovers: LayoutUnit[] = [];
    for (const id of gens[focusGen] ?? []) {
      if (claimed.has(id)) continue;
      const partnerIds = [...(partnersIndex.get(id) ?? [])].filter(
        (p) =>
          !claimed.has(p) &&
          (gens[focusGen] ?? []).includes(p) &&
          !(focusUnit.ids as readonly string[]).includes(p),
      );
      let unit: LayoutUnit;
      if (partnerIds.length > 0) {
        const orderedPartners = partnerIds.sort((a, b) =>
          a.localeCompare(b),
        );
        unit = {
          ids: [...orderedPartners, id],
          isCouple: orderedPartners.length === 1,
        };
        claimed.add(id);
        for (const p of orderedPartners) claimed.add(p);
      } else {
        unit = { ids: [id], isCouple: false };
        claimed.add(id);
      }
      // Inherit side from parents / aunt-uncle attachment — never dump a
      // right-side cousin (David Foltz) into the left leftovers pack.
      const side = sideForFocusPerson(unit.ids[unit.ids.length - 1]!, leftId, rightId);
      let partnerSide: "left" | "right" | "unknown" = "unknown";
      for (const pid of unit.ids.slice(0, -1)) {
        const s = sideForFocusPerson(pid, leftId, rightId);
        if (s === "right") partnerSide = "right";
        else if (s === "left" && partnerSide === "unknown") partnerSide = "left";
      }
      if (side === "right" || partnerSide === "right") {
        rightLeftovers.push(unit);
      } else {
        leftLeftovers.push(unit);
      }
    }

    // Pack left→right: left leftovers | left flank | focus | right flank | right leftovers
    const focusRow: LayoutUnit[] = [
      ...leftLeftovers,
      ...leftFlank,
      focusUnit,
      ...[...rightFlank].reverse(),
      ...rightLeftovers,
    ];
    const yFocus = focusGen * (TREE_LAYOUT.nodeHeight + TREE_LAYOUT.vGap);
    packRowFixedGap(focusRow, yFocus, unitGap);
    unitsByGen[focusGen] = focusRow;
    gens[focusGen] = focusRow.flatMap((u) => [...u.ids]);

    const leftMemberIds = new Set<string>([
      leftId,
      ...leftFlank.flatMap((u) => [...u.ids]),
      ...leftLeftovers.flatMap((u) => [...u.ids]),
    ]);
    const rightMemberIds = new Set<string>([
      rightId,
      ...rightFlank.flatMap((u) => [...u.ids]),
      ...rightLeftovers.flatMap((u) => [...u.ids]),
    ]);

    const focusBounds = unitBounds(focusUnit)!;

    // Ancestor generations: side by children's flank, then park above kids.
    for (let g = focusGen - 1; g >= 0; g--) {
      const y = g * (TREE_LAYOUT.nodeHeight + TREE_LAYOUT.vGap);
      const rawUnits = familyUnitsForGeneration(gens[g]!, layoutIqCtx);
      type Tagged = {
        unit: LayoutUnit;
        side: "left" | "right" | "unknown";
        target: number | null;
      };
      const tagged: Tagged[] = rawUnits.map((unit) => ({
        unit,
        side: sideForParentUnit(
          unit,
          leftMemberIds,
          rightMemberIds,
          leftId,
          rightId,
        ),
        target: targetMidForUnit(unit),
      }));

      const leftUnits = tagged
        .filter((t) => t.side === "left")
        .sort((a, b) => (a.target ?? 0) - (b.target ?? 0));
      const rightUnits = tagged
        .filter((t) => t.side === "right")
        .sort((a, b) => (a.target ?? 0) - (b.target ?? 0));
      const unknownUnits = tagged.filter((t) => t.side === "unknown");

      function isFocusParentUnit(
        unit: LayoutUnit,
        spouseId: string,
      ): boolean {
        return unit.ids.some((id) =>
          (parentsByChild.get(spouseId) ?? []).includes(id),
        );
      }

      /**
       * Dock parent-row siblings immediately beside the focus-parent couple
       * they attach to (Betty+Ralph right of Paul+Helene), never first-empty-x.
       */
      function placeSideAncestorUnits(
        units: Tagged[],
        side: "left" | "right",
        focusSpouseId: string,
      ) {
        const core = units.filter((t) =>
          isFocusParentUnit(t.unit, focusSpouseId),
        );
        const collateral = units.filter(
          (t) => !isFocusParentUnit(t.unit, focusSpouseId),
        );

        if (side === "left") {
          let cursorRight = focusBounds.left - unitGap;
          // Core parents first (inner), then collateral further out.
          const ordered = [...collateral, ...core];
          for (let i = ordered.length - 1; i >= 0; i--) {
            const { unit, target } = ordered[i]!;
            const w = unitWidth(unit);
            let leftX = cursorRight - w;
            if (target != null && isFocusParentUnit(unit, focusSpouseId)) {
              leftX = Math.min(target - w / 2, cursorRight - w);
            }
            placeUnitAt(unit, leftX, y);
            const bounds = unitBounds(unit)!;
            cursorRight = bounds.left - unitGap;
          }
        } else {
          let cursorLeft = focusBounds.right + unitGap;
          const ordered = [...core, ...collateral];
          for (const { unit, target } of ordered) {
            const w = unitWidth(unit);
            let leftX = cursorLeft;
            if (target != null && isFocusParentUnit(unit, focusSpouseId)) {
              leftX = Math.max(target - w / 2, cursorLeft);
            }
            placeUnitAt(unit, leftX, y);
            const bounds = unitBounds(unit)!;
            cursorLeft = bounds.right + unitGap;
          }
        }
      }

      placeSideAncestorUnits(leftUnits, "left", leftId);
      placeSideAncestorUnits(rightUnits, "right", rightId);

      for (const t of unknownUnits) {
        const w = unitWidth(t.unit);
        const mid = t.target ?? focusBounds.mid;
        placeUnitAt(t.unit, mid - w / 2, y);
      }

      const allUnits = [
        ...leftUnits.map((t) => t.unit),
        ...unknownUnits.map((t) => t.unit),
        ...rightUnits.map((t) => t.unit),
      ];
      allUnits.sort((a, b) => (unitMidX(a) ?? 0) - (unitMidX(b) ?? 0));
      resolveUnitOverlaps(allUnits);

      // Enforce side vs focus mid after overlap resolution.
      for (const t of leftUnits) {
        const b = unitBounds(t.unit);
        if (!b) continue;
        if (b.mid >= focusBounds.mid) {
          shiftUnit(t.unit, focusBounds.left - unitGap - b.right);
        } else if (b.right > focusBounds.left - TREE_LAYOUT.hGap) {
          shiftUnit(
            t.unit,
            focusBounds.left - TREE_LAYOUT.hGap - unitGap - b.right,
          );
        }
      }
      for (const t of rightUnits) {
        const b = unitBounds(t.unit);
        if (!b) continue;
        if (b.mid <= focusBounds.mid) {
          shiftUnit(t.unit, focusBounds.right + unitGap - b.left);
        } else if (b.left < focusBounds.right + TREE_LAYOUT.hGap) {
          shiftUnit(
            t.unit,
            focusBounds.right + TREE_LAYOUT.hGap + unitGap - b.left,
          );
        }
      }
      resolveUnitOverlaps(allUnits);

      // Nudge each parent unit toward its children without crossing sides.
      for (const t of [...leftUnits, ...rightUnits, ...unknownUnits]) {
        const kidMid = targetMidForUnit(t.unit);
        const b = unitBounds(t.unit);
        if (kidMid == null || !b) continue;
        let dx = kidMid - b.mid;
        if (t.side === "left") {
          const maxRight = focusBounds.left - TREE_LAYOUT.hGap;
          if (b.right + dx > maxRight) dx = maxRight - b.right;
        } else if (t.side === "right") {
          const minLeft = focusBounds.right + TREE_LAYOUT.hGap;
          if (b.left + dx < minLeft) dx = minLeft - b.left;
        }
        shiftUnit(t.unit, dx);
      }
      resolveUnitOverlaps(allUnits);

      unitsByGen[g] = allUnits;
      gens[g] = allUnits.flatMap((u) => [...u.ids]);
    }

    // After parent rows settle, seat aunt/uncle cousins under their own
    // parents (David under Betty+Ralph). Do NOT move blood siblings of the
    // focus spouse (Donna stays beside Kat).
    function isAuntUncleCousin(personId: string, anchorId: string): boolean {
      for (const parent of parentsByChild.get(anchorId) ?? []) {
        for (const auntUncle of siblingAdj.get(parent) ?? []) {
          const household = [auntUncle, partnerOf.get(auntUncle)].filter(
            (x): x is string => Boolean(x),
          );
          for (const adult of household) {
            if ((childrenByParent.get(adult) ?? []).includes(personId)) {
              return true;
            }
          }
        }
      }
      return false;
    }

    function seatFlankCousinBlocks(
      memberIds: Set<string>,
      anchorId: string,
      side: "left" | "right",
    ) {
      const cousinIds = [...memberIds].filter(
        (id) =>
          id !== leftId &&
          id !== rightId &&
          isAuntUncleCousin(id, anchorId),
      );
      if (cousinIds.length === 0) return;

      // Build units from cousins on this row (couples stay atomic).
      const used = new Set<string>();
      const units: LayoutUnit[] = [];
      for (const id of cousinIds) {
        if (used.has(id)) continue;
        const p = partnerOf.get(id);
        if (
          p &&
          memberIds.has(p) &&
          p !== leftId &&
          p !== rightId &&
          !used.has(p)
        ) {
          const aPos = positions.get(id);
          const bPos = positions.get(p);
          const leftPerson =
            aPos && bPos && aPos.x <= bPos.x ? id : p;
          const rightPerson = leftPerson === id ? p : id;
          units.push({ ids: [leftPerson, rightPerson], isCouple: true });
          used.add(id);
          used.add(p);
        } else {
          units.push({ ids: [id], isCouple: false });
          used.add(id);
        }
      }

      const y =
        (positions.get(cousinIds[0]!)?.y ??
          focusGen * (TREE_LAYOUT.nodeHeight + TREE_LAYOUT.vGap));
      const placed = centerUnitsUnderSharedParents(
        units,
        y,
        side === "left" ? focusBounds.left : focusBounds.right,
      );

      // Keep the whole block on the correct flank of the focus couple.
      for (const unit of placed) {
        const b = unitBounds(unit);
        if (!b) continue;
        if (side === "left" && b.right > focusBounds.left - TREE_LAYOUT.hGap) {
          shiftUnit(
            unit,
            focusBounds.left - TREE_LAYOUT.hGap - unitGap - b.right,
          );
        } else if (
          side === "right" &&
          b.left < focusBounds.right + TREE_LAYOUT.hGap
        ) {
          shiftUnit(
            unit,
            focusBounds.right + TREE_LAYOUT.hGap + unitGap - b.left,
          );
        }
      }
    }
    seatFlankCousinBlocks(leftMemberIds, leftId, "left");
    seatFlankCousinBlocks(rightMemberIds, rightId, "right");
    resolveUnitOverlaps(unitsByGen[focusGen]!);

    // Descendants: center each sibling block on the parent-couple midpoint.
    for (let g = focusGen + 1; g <= maxGen; g++) {
      const y = g * (TREE_LAYOUT.nodeHeight + TREE_LAYOUT.vGap);
      const units = familyUnitsForGeneration(gens[g]!, layoutIqCtx);
      const ordered = centerUnitsUnderSharedParents(
        units,
        y,
        focusBounds.mid,
      );
      unitsByGen[g] = ordered;
      gens[g] = ordered.flatMap((u) => [...u.ids]);
    }

    // Any generation still empty (disconnected) — pack by Layout IQ order.
    for (let g = 0; g <= maxGen; g++) {
      if ((unitsByGen[g] ?? []).length > 0) continue;
      if ((gens[g] ?? []).length === 0) continue;
      const y = g * (TREE_LAYOUT.nodeHeight + TREE_LAYOUT.vGap);
      const units = familyUnitsForGeneration(gens[g]!, layoutIqCtx);
      packUnits(units, y);
      unitsByGen[g] = units;
    }
  }

  // Sync flat generation order to final unit x order (for diagnostics).
  for (let g = 0; g <= maxGen; g++) {
    const orderedUnits = [...(unitsByGen[g] ?? [])].sort(
      (a, b) => (unitMidX(a) ?? 0) - (unitMidX(b) ?? 0),
    );
    unitsByGen[g] = orderedUnits;
    if (orderedUnits.length === 0) continue;
    gens[g] = orderedUnits.flatMap((u) => [...u.ids]);
    if (g > focusGenForSync) {
      // Re-assert sibling blocks centered on parent mids after sorting.
      const y = g * (TREE_LAYOUT.nodeHeight + TREE_LAYOUT.vGap);
      const fallback =
        orderedUnits.length > 0 ? (unitMidX(orderedUnits[0]!) ?? 0) : 0;
      unitsByGen[g] = centerUnitsUnderSharedParents(
        orderedUnits,
        y,
        fallback,
      );
      gens[g] = unitsByGen[g]!.flatMap((u) => [...u.ids]);
    } else {
      resolveUnitOverlaps(orderedUnits);
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
