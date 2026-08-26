/**
 * Family Tree repair — detect corrupted graphs and plan safe, non-destructive fixes.
 *
 * Pure functions only. Persistence lives in repair-apply / getFamilyTreeGraph.
 */

import type { FamilyTreeRelationType } from "@/lib/db/schema";
import {
  canAutoSpouseCoParents,
  hasPartnerLink,
  spouseIdsOf,
  type GenealogyEdge,
} from "@/lib/family-tree/genealogy-iq";
import { findMislinkedCoParentSiblingEdges } from "@/lib/family-tree/scaffold";
import {
  areOnSameAncestryLine,
  wouldCreateParentCycle,
} from "@/lib/family-tree/validate";
import { canonicalizeRelationshipEndpoints } from "@/lib/family-tree/relations";

export const FAMILY_TREE_REVIEW_MARKER = "[needs-review]";
export const FAMILY_TREE_REVIEW_DISMISSED_MARKER = "[review-dismissed]";

export type RepairNode = {
  id: string;
  label: string;
  personId: string | null;
  notes: string | null;
};

export type RepairEdge = GenealogyEdge & {
  id?: string;
};

export type RepairGraph = {
  nodes: RepairNode[];
  relationships: RepairEdge[];
};

export type RepairOp =
  | {
      op: "split_merged_label";
      nodeId: string;
      nameA: string;
      nameB: string;
      /** Copy parent_of→children edges onto the new spouse node. */
      shareChildren: boolean;
    }
  | {
      op: "flip_sibling_to_partner";
      edgeId: string;
      fromNodeId: string;
      toNodeId: string;
    }
  | {
      op: "delete_edge";
      edgeId: string;
      reason: string;
    }
  | {
      op: "add_partner";
      a: string;
      b: string;
      reason: string;
    }
  | {
      op: "flag_review";
      nodeId: string;
      reason: string;
    };

export type RepairPlan = {
  ops: RepairOp[];
  /** Human summary when any auto-fix ran or will run. */
  summary: string | null;
  beforeSnapshot: RepairSnapshot;
};

export type RepairSnapshot = {
  nodeCount: number;
  relationshipCount: number;
  relationshipKeys: string[];
  nodeLabels: Record<string, string>;
};

export type RepairApplyResult = {
  applied: boolean;
  opsApplied: number;
  flaggedNodeIds: string[];
  message: string | null;
  before: RepairSnapshot;
  after: RepairSnapshot;
};

const MERGED_LABEL =
  /^(.+?)\s*(?:&+|\/+|and)\s+(.+)$/i;

/**
 * Parse a display label that compresses two people into one identity.
 * Returns null when the label is a single person name.
 */
export function parseMergedCoupleLabel(
  label: string,
): { nameA: string; nameB: string } | null {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const match = MERGED_LABEL.exec(trimmed);
  if (!match) return null;
  const nameA = match[1]!.trim();
  const nameB = match[2]!.trim();
  if (!nameA || !nameB) return null;
  if (nameA.toLowerCase() === nameB.toLowerCase()) return null;
  // Avoid splitting phrases like "Mom and Dad" when they are intentional
  // couple placeholders — those are still two identities and SHOULD split.
  if (nameA.length > 80 || nameB.length > 80) return null;
  return { nameA, nameB };
}

export function nodeNeedsReview(notes: string | null | undefined): boolean {
  return Boolean(notes?.includes(FAMILY_TREE_REVIEW_MARKER));
}

export function reviewReasonFromNotes(
  notes: string | null | undefined,
): string | null {
  if (!notes?.includes(FAMILY_TREE_REVIEW_MARKER)) return null;
  const lines = notes.split(/\r?\n/);
  const line = lines.find((l) => l.includes(FAMILY_TREE_REVIEW_MARKER));
  if (!line) return null;
  const reason = line
    .replace(FAMILY_TREE_REVIEW_MARKER, "")
    .replace(/^[:\s-]+/, "")
    .trim();
  return reason || "Needs review";
}

export function withReviewFlag(
  notes: string | null | undefined,
  reason: string,
): string {
  const cleaned = clearReviewFlag(notes);
  const flagLine = `${FAMILY_TREE_REVIEW_MARKER} ${reason.trim()}`.trim();
  return cleaned ? `${cleaned}\n${flagLine}` : flagLine;
}

export function clearReviewFlag(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const withoutActive = notes
    .split(/\r?\n/)
    .filter((line) => !line.includes(FAMILY_TREE_REVIEW_MARKER))
    .join("\n")
    .trim();
  const dismissed = withoutActive.includes(FAMILY_TREE_REVIEW_DISMISSED_MARKER)
    ? withoutActive
    : withoutActive
      ? `${withoutActive}\n${FAMILY_TREE_REVIEW_DISMISSED_MARKER}`
      : FAMILY_TREE_REVIEW_DISMISSED_MARKER;
  return dismissed;
}

export function wasReviewDismissed(notes: string | null | undefined): boolean {
  return Boolean(notes?.includes(FAMILY_TREE_REVIEW_DISMISSED_MARKER));
}

export function snapshotRepairGraph(graph: RepairGraph): RepairSnapshot {
  const relationshipKeys = graph.relationships
    .map((r) => `${r.type}:${r.fromNodeId}->${r.toNodeId}`)
    .sort();
  const nodeLabels: Record<string, string> = {};
  for (const n of graph.nodes) nodeLabels[n.id] = n.label;
  return {
    nodeCount: graph.nodes.length,
    relationshipCount: graph.relationships.length,
    relationshipKeys,
    nodeLabels,
  };
}

function parentsOf(edges: RepairEdge[], childId: string): string[] {
  return edges
    .filter((e) => e.type === "parent_of" && e.toNodeId === childId)
    .map((e) => e.fromNodeId);
}

function childrenOf(edges: RepairEdge[], parentId: string): string[] {
  return edges
    .filter((e) => e.type === "parent_of" && e.fromNodeId === parentId)
    .map((e) => e.toNodeId);
}

/**
 * Plan safe repairs for a corrupted family tree graph.
 * Ambiguous cases become flag_review ops — never destructive guesses.
 */
export function planFamilyTreeRepair(graph: RepairGraph): RepairPlan {
  const ops: RepairOp[] = [];
  const beforeSnapshot = snapshotRepairGraph(graph);
  const workingEdges: RepairEdge[] = graph.relationships.map((r) => ({ ...r }));
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const flagged = new Set<string>();

  const pushFlag = (nodeId: string, reason: string) => {
    if (flagged.has(nodeId)) return;
    const node = nodeById.get(nodeId);
    if (
      node &&
      (nodeNeedsReview(node.notes) || wasReviewDismissed(node.notes))
    ) {
      flagged.add(nodeId);
      return;
    }
    flagged.add(nodeId);
    ops.push({ op: "flag_review", nodeId, reason });
  };

  // 1) Split merged couple labels ("Jeff & Kathy")
  for (const node of graph.nodes) {
    // Skip if already linked as a person — merging usually hit placeholders / labels
    const parsed = parseMergedCoupleLabel(node.label);
    if (!parsed) continue;
    // Don't re-split if a partner already exists with one of the names
    const spouses = spouseIdsOf(workingEdges, node.id);
    const spouseLabels = spouses.map(
      (id) => nodeById.get(id)?.label?.trim().toLowerCase() ?? "",
    );
    if (
      spouseLabels.includes(parsed.nameB.toLowerCase()) ||
      spouseLabels.includes(parsed.nameA.toLowerCase())
    ) {
      continue;
    }
    ops.push({
      op: "split_merged_label",
      nodeId: node.id,
      nameA: parsed.nameA,
      nameB: parsed.nameB,
      shareChildren: childrenOf(workingEdges, node.id).length > 0,
    });
  }

  // 2) Mislinked co-parent siblings → partners
  for (const edge of findMislinkedCoParentSiblingEdges(workingEdges)) {
    if (!edge.id) continue;
    const endpoints = canonicalizeRelationshipEndpoints(
      "partner_of",
      edge.fromNodeId,
      edge.toNodeId,
    );
    if (hasPartnerLink(workingEdges, endpoints.fromNodeId, endpoints.toNodeId)) {
      ops.push({
        op: "delete_edge",
        edgeId: edge.id,
        reason: "Duplicate co-parent sibling edge; spouse link already exists.",
      });
    } else {
      ops.push({
        op: "flip_sibling_to_partner",
        edgeId: edge.id,
        fromNodeId: endpoints.fromNodeId,
        toNodeId: endpoints.toNodeId,
      });
      // Reflect in working set for later co-parent pairing
      const idx = workingEdges.findIndex((e) => e.id === edge.id);
      if (idx >= 0) {
        workingEdges[idx] = {
          ...workingEdges[idx]!,
          type: "partner_of",
          fromNodeId: endpoints.fromNodeId,
          toNodeId: endpoints.toNodeId,
        };
      }
    }
  }

  // 3) Pair parent couples (missing spouse between safe co-parents)
  const parentsByChild = new Map<string, string[]>();
  for (const e of workingEdges) {
    if (e.type !== "parent_of") continue;
    const list = parentsByChild.get(e.toNodeId) ?? [];
    list.push(e.fromNodeId);
    parentsByChild.set(e.toNodeId, list);
  }
  const paired = new Set<string>();
  for (const [childId, parents] of parentsByChild) {
    if (parents.length !== 2) {
      if (parents.length > 2) {
        pushFlag(
          childId,
          "More than two parents — confirm which couple is correct.",
        );
        for (const p of parents) {
          pushFlag(p, "Co-parent set is ambiguous (more than two parents).");
        }
      }
      continue;
    }
    const [a, b] = parents;
    if (!a || !b) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (paired.has(key)) continue;
    paired.add(key);
    if (!canAutoSpouseCoParents(workingEdges, a, b)) continue;
    ops.push({
      op: "add_partner",
      a,
      b,
      reason: `Co-parents of ${nodeById.get(childId)?.label ?? "child"}`,
    });
    workingEdges.push({
      fromNodeId: a < b ? a : b,
      toNodeId: a < b ? b : a,
      type: "partner_of",
    });
  }

  // 4) Cross-spouse parent fan-in (same parent of both spouses) → flag, don't delete
  for (const e of workingEdges) {
    if (e.type !== "partner_of") continue;
    const a = e.fromNodeId;
    const b = e.toNodeId;
    const parentsA = new Set(parentsOf(workingEdges, a));
    const parentsB = new Set(parentsOf(workingEdges, b));
    for (const p of parentsA) {
      if (parentsB.has(p)) {
        pushFlag(
          p,
          "Linked as a parent of both spouses — confirm which child is correct.",
        );
        pushFlag(a, "Shares a parent edge with spouse — needs review.");
        pushFlag(b, "Shares a parent edge with spouse — needs review.");
      }
    }
  }

  // 5) Phantom / conflicting role edges — remove impossible undirected links
  //    when a parent_of already exists between the same pair.
  const parentPairs = new Set<string>();
  for (const e of workingEdges) {
    if (e.type !== "parent_of") continue;
    parentPairs.add(`${e.fromNodeId}|${e.toNodeId}`);
    parentPairs.add(`${e.toNodeId}|${e.fromNodeId}`);
  }
  for (const e of workingEdges) {
    if (!e.id) continue;
    if (
      e.type !== "partner_of" &&
      e.type !== "sibling_of" &&
      e.type !== "cousin_of" &&
      e.type !== "sister_in_law_of" &&
      e.type !== "brother_in_law_of" &&
      e.type !== "other_relative_of"
    ) {
      continue;
    }
    const key = `${e.fromNodeId}|${e.toNodeId}`;
    if (parentPairs.has(key)) {
      ops.push({
        op: "delete_edge",
        edgeId: e.id,
        reason: `${e.type} conflicts with an existing parent/child link.`,
      });
    }
  }

  // 6) Cyclic parent_of edges
  const ancestry: GenealogyEdge[] = workingEdges
    .filter((e) => e.type === "parent_of")
    .map((e) => ({
      fromNodeId: e.fromNodeId,
      toNodeId: e.toNodeId,
      type: "parent_of" as FamilyTreeRelationType,
    }));
  for (const e of workingEdges) {
    if (e.type !== "parent_of" || !e.id) continue;
    const without = ancestry.filter(
      (a) => !(a.fromNodeId === e.fromNodeId && a.toNodeId === e.toNodeId),
    );
    if (wouldCreateParentCycle(without, e.fromNodeId, e.toNodeId)) {
      ops.push({
        op: "delete_edge",
        edgeId: e.id,
        reason: "Parent link creates a circular ancestry.",
      });
    }
  }

  // 7) Cousin attached as child of the cousin peer — remove parent_of
  for (const e of workingEdges) {
    if (e.type !== "cousin_of") continue;
    const a = e.fromNodeId;
    const b = e.toNodeId;
    for (const parentEdge of workingEdges) {
      if (parentEdge.type !== "parent_of" || !parentEdge.id) continue;
      const wrongChild =
        (parentEdge.fromNodeId === a && parentEdge.toNodeId === b) ||
        (parentEdge.fromNodeId === b && parentEdge.toNodeId === a);
      if (wrongChild) {
        ops.push({
          op: "delete_edge",
          edgeId: parentEdge.id,
          reason: "Cousin was incorrectly linked as a child of their cousin.",
        });
      }
    }
  }

  // 8) Partner/sibling on same ancestry line (phantom)
  for (const e of workingEdges) {
    if (!e.id) continue;
    if (e.type !== "partner_of" && e.type !== "sibling_of") continue;
    if (areOnSameAncestryLine(ancestry, e.fromNodeId, e.toNodeId)) {
      ops.push({
        op: "delete_edge",
        edgeId: e.id,
        reason: `${e.type} conflicts with ancestry (circular / impossible).`,
      });
    }
  }

  const autoFixCount = ops.filter((o) => o.op !== "flag_review").length;
  const flagCount = ops.filter((o) => o.op === "flag_review").length;
  let summary: string | null = null;
  if (autoFixCount > 0) {
    summary = "We fixed some family tree connections for accuracy.";
    if (flagCount > 0) {
      summary += " A few people still need a quick review.";
    }
  } else if (flagCount > 0) {
    summary = "Some family tree connections need a quick review.";
  }

  return { ops, summary, beforeSnapshot };
}
