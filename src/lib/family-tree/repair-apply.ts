/**
 * Apply Family Tree repair ops (idempotent sequential writes — Neon HTTP).
 */

import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import {
  familyTreeNodes,
  familyTreeRelationships,
  type FamilyTreeNode,
  type FamilyTreeRelationship,
} from "@/lib/db/schema";
import { canonicalizeRelationshipEndpoints } from "@/lib/family-tree/relations";
import {
  planFamilyTreeRepair,
  snapshotRepairGraph,
  withReviewFlag,
  type RepairApplyResult,
  type RepairGraph,
  type RepairOp,
} from "@/lib/family-tree/repair";
import type { FamilyTreeScope } from "@/lib/family-tree/scope";

function toRepairGraph(
  nodes: FamilyTreeNode[],
  relationships: FamilyTreeRelationship[],
): RepairGraph {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.label,
      personId: n.personId,
      notes: n.notes,
    })),
    relationships: relationships.map((r) => ({
      id: r.id,
      fromNodeId: r.fromNodeId,
      toNodeId: r.toNodeId,
      type: r.type,
    })),
  };
}

async function applyOp(
  scope: FamilyTreeScope,
  op: RepairOp,
  state: {
    nodes: FamilyTreeNode[];
    relationships: FamilyTreeRelationship[];
  },
): Promise<void> {
  const db = getDb();
  const { familyId, peopleOwnerId } = scope;

  switch (op.op) {
    case "flag_review": {
      const existing = state.nodes.find((n) => n.id === op.nodeId);
      if (!existing) return;
      const notes = withReviewFlag(existing.notes, op.reason);
      const [updated] = await db
        .update(familyTreeNodes)
        .set({ notes, updatedAt: new Date() })
        .where(
          and(
            eq(familyTreeNodes.id, op.nodeId),
            eq(familyTreeNodes.familyId, familyId),
          ),
        )
        .returning();
      if (updated) {
        state.nodes = state.nodes.map((n) =>
          n.id === op.nodeId ? updated : n,
        );
      }
      return;
    }

    case "delete_edge": {
      await db
        .delete(familyTreeRelationships)
        .where(
          and(
            eq(familyTreeRelationships.id, op.edgeId),
            eq(familyTreeRelationships.familyId, familyId),
          ),
        );
      state.relationships = state.relationships.filter(
        (r) => r.id !== op.edgeId,
      );
      return;
    }

    case "flip_sibling_to_partner": {
      const endpoints = canonicalizeRelationshipEndpoints(
        "partner_of",
        op.fromNodeId,
        op.toNodeId,
      );
      const already = state.relationships.some(
        (r) =>
          r.type === "partner_of" &&
          r.fromNodeId === endpoints.fromNodeId &&
          r.toNodeId === endpoints.toNodeId,
      );
      if (already) {
        await db
          .delete(familyTreeRelationships)
          .where(
            and(
              eq(familyTreeRelationships.id, op.edgeId),
              eq(familyTreeRelationships.familyId, familyId),
            ),
          );
        state.relationships = state.relationships.filter(
          (r) => r.id !== op.edgeId,
        );
        return;
      }
      const [updated] = await db
        .update(familyTreeRelationships)
        .set({
          type: "partner_of",
          fromNodeId: endpoints.fromNodeId,
          toNodeId: endpoints.toNodeId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(familyTreeRelationships.id, op.edgeId),
            eq(familyTreeRelationships.familyId, familyId),
            eq(familyTreeRelationships.type, "sibling_of"),
          ),
        )
        .returning();
      if (updated) {
        state.relationships = state.relationships.map((r) =>
          r.id === op.edgeId ? updated : r,
        );
      }
      return;
    }

    case "add_partner": {
      const endpoints = canonicalizeRelationshipEndpoints(
        "partner_of",
        op.a,
        op.b,
      );
      const exists = state.relationships.some(
        (r) =>
          r.type === "partner_of" &&
          r.fromNodeId === endpoints.fromNodeId &&
          r.toNodeId === endpoints.toNodeId,
      );
      if (exists) return;
      const id = nanoid();
      const [created] = await db
        .insert(familyTreeRelationships)
        .values({
          id,
          userId: peopleOwnerId,
          familyId,
          fromNodeId: endpoints.fromNodeId,
          toNodeId: endpoints.toNodeId,
          type: "partner_of",
        })
        .onConflictDoNothing()
        .returning();
      if (created) {
        state.relationships = [...state.relationships, created];
      }
      return;
    }

    case "add_parent": {
      const endpoints = canonicalizeRelationshipEndpoints(
        "parent_of",
        op.parentId,
        op.childId,
      );
      const exists = state.relationships.some(
        (r) =>
          r.type === "parent_of" &&
          r.fromNodeId === endpoints.fromNodeId &&
          r.toNodeId === endpoints.toNodeId,
      );
      if (exists) return;
      const id = nanoid();
      const [created] = await db
        .insert(familyTreeRelationships)
        .values({
          id,
          userId: peopleOwnerId,
          familyId,
          fromNodeId: endpoints.fromNodeId,
          toNodeId: endpoints.toNodeId,
          type: "parent_of",
        })
        .onConflictDoNothing()
        .returning();
      if (created) {
        state.relationships = [...state.relationships, created];
      }
      return;
    }

    case "retarget_edge": {
      const endpoints = canonicalizeRelationshipEndpoints(
        "sibling_of",
        op.fromNodeId,
        op.toNodeId,
      );
      const duplicate = state.relationships.some(
        (r) =>
          r.id !== op.edgeId &&
          r.type === "sibling_of" &&
          r.fromNodeId === endpoints.fromNodeId &&
          r.toNodeId === endpoints.toNodeId,
      );
      if (duplicate) {
        await db
          .delete(familyTreeRelationships)
          .where(
            and(
              eq(familyTreeRelationships.id, op.edgeId),
              eq(familyTreeRelationships.familyId, familyId),
            ),
          );
        state.relationships = state.relationships.filter(
          (r) => r.id !== op.edgeId,
        );
        return;
      }
      const [updated] = await db
        .update(familyTreeRelationships)
        .set({
          fromNodeId: endpoints.fromNodeId,
          toNodeId: endpoints.toNodeId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(familyTreeRelationships.id, op.edgeId),
            eq(familyTreeRelationships.familyId, familyId),
          ),
        )
        .returning();
      if (updated) {
        state.relationships = state.relationships.map((r) =>
          r.id === op.edgeId ? updated : r,
        );
      }
      return;
    }

    case "ensure_cousin_lineage": {
      const { planFamilyTreeScaffold, isScaffoldTempKey } = await import(
        "@/lib/family-tree/scaffold"
      );
      const plan = planFamilyTreeScaffold(
        {
          nodes: state.nodes.map((n) => ({
            id: n.id,
            label: n.label,
            personId: n.personId,
          })),
          relationships: state.relationships.map((r) => ({
            fromNodeId: r.fromNodeId,
            toNodeId: r.toNodeId,
            type: r.type,
          })),
        },
        {
          fromNodeId: op.subjectId,
          toNodeId: op.cousinId,
          type: "cousin_of",
          cousinSide: op.side ?? "unknown",
          cousinSubjectId: op.subjectId,
        },
      );
      if (plan.nodes.length === 0 && plan.relationships.length === 0) {
        return;
      }

      const keyToId = new Map<string, string>();
      for (const n of state.nodes) keyToId.set(n.id, n.id);

      for (const planned of plan.nodes) {
        const id = nanoid();
        const [created] = await db
          .insert(familyTreeNodes)
          .values({
            id,
            userId: peopleOwnerId,
            familyId,
            personId: null,
            label: planned.label,
          })
          .returning();
        if (created) {
          state.nodes = [...state.nodes, created];
          keyToId.set(planned.key, created.id);
        }
      }

      const resolve = (key: string) =>
        keyToId.get(key) ?? (isScaffoldTempKey(key) ? null : key);

      for (const planned of plan.relationships) {
        const fromNodeId = resolve(planned.fromKey);
        const toNodeId = resolve(planned.toKey);
        if (!fromNodeId || !toNodeId) continue;
        const endpoints = canonicalizeRelationshipEndpoints(
          planned.type,
          fromNodeId,
          toNodeId,
        );
        const exists = state.relationships.some(
          (r) =>
            r.type === planned.type &&
            r.fromNodeId === endpoints.fromNodeId &&
            r.toNodeId === endpoints.toNodeId,
        );
        if (exists) continue;
        const [created] = await db
          .insert(familyTreeRelationships)
          .values({
            id: nanoid(),
            userId: peopleOwnerId,
            familyId,
            fromNodeId: endpoints.fromNodeId,
            toNodeId: endpoints.toNodeId,
            type: planned.type,
          })
          .onConflictDoNothing()
          .returning();
        if (created) {
          state.relationships = [...state.relationships, created];
        }
      }
      return;
    }

    case "split_merged_label": {
      const existing = state.nodes.find((n) => n.id === op.nodeId);
      if (!existing) return;
      // Idempotent: if label no longer looks merged, skip
      if (existing.label.trim() !== `${op.nameA} & ${op.nameB}` &&
          existing.label.trim().toLowerCase() !==
            `${op.nameA} and ${op.nameB}`.toLowerCase() &&
          !existing.label.includes("&") &&
          !/\band\b/i.test(existing.label)) {
        // Still try if parse would match current label
        const stillMerged =
          existing.label.toLowerCase().includes(op.nameA.toLowerCase()) &&
          existing.label.toLowerCase().includes(op.nameB.toLowerCase()) &&
          existing.label !== op.nameA;
        if (!stillMerged) return;
      }

      const newId = nanoid();
      const [renamed] = await db
        .update(familyTreeNodes)
        .set({
          label: op.nameA,
          notes: withReviewFlag(
            existing.notes,
            "Split from a merged couple label — confirm parents belong here.",
          ),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(familyTreeNodes.id, op.nodeId),
            eq(familyTreeNodes.familyId, familyId),
          ),
        )
        .returning();

      const [created] = await db
        .insert(familyTreeNodes)
        .values({
          id: newId,
          userId: peopleOwnerId,
          familyId,
          personId: null,
          label: op.nameB,
          notes: withReviewFlag(
            null,
            "Split from a merged couple label — link a person and confirm parents.",
          ),
        })
        .returning();

      if (renamed) {
        state.nodes = state.nodes.map((n) =>
          n.id === op.nodeId ? renamed : n,
        );
      }
      if (created) {
        state.nodes = [...state.nodes, created];
      }

      const endpoints = canonicalizeRelationshipEndpoints(
        "partner_of",
        op.nodeId,
        newId,
      );
      const partnerExists = state.relationships.some(
        (r) =>
          r.type === "partner_of" &&
          r.fromNodeId === endpoints.fromNodeId &&
          r.toNodeId === endpoints.toNodeId,
      );
      if (!partnerExists) {
        const [partner] = await db
          .insert(familyTreeRelationships)
          .values({
            id: nanoid(),
            userId: peopleOwnerId,
            familyId,
            fromNodeId: endpoints.fromNodeId,
            toNodeId: endpoints.toNodeId,
            type: "partner_of",
          })
          .onConflictDoNothing()
          .returning();
        if (partner) {
          state.relationships = [...state.relationships, partner];
        }
      }

      if (op.shareChildren) {
        const childEdges = state.relationships.filter(
          (r) => r.type === "parent_of" && r.fromNodeId === op.nodeId,
        );
        for (const childEdge of childEdges) {
          const already = state.relationships.some(
            (r) =>
              r.type === "parent_of" &&
              r.fromNodeId === newId &&
              r.toNodeId === childEdge.toNodeId,
          );
          if (already) continue;
          const [copied] = await db
            .insert(familyTreeRelationships)
            .values({
              id: nanoid(),
              userId: peopleOwnerId,
              familyId,
              fromNodeId: newId,
              toNodeId: childEdge.toNodeId,
              type: "parent_of",
            })
            .onConflictDoNothing()
            .returning();
          if (copied) {
            state.relationships = [...state.relationships, copied];
          }
        }
      }
      return;
    }

    default: {
      const _exhaustive: never = op;
      void _exhaustive;
    }
  }
}

/**
 * Detect corruption and apply safe repairs for one family tree.
 * Idempotent; logs before/after relationship snapshots.
 */
export async function runFamilyTreeRepairPass(
  scope: FamilyTreeScope,
  nodes: FamilyTreeNode[],
  relationships: FamilyTreeRelationship[],
  options: { dryRun?: boolean } = {},
): Promise<{
  nodes: FamilyTreeNode[];
  relationships: FamilyTreeRelationship[];
  result: RepairApplyResult;
}> {
  const plan = planFamilyTreeRepair(toRepairGraph(nodes, relationships));
  const state = {
    nodes: [...nodes],
    relationships: [...relationships],
  };

  if (plan.ops.length === 0) {
    const snap = snapshotRepairGraph(toRepairGraph(state.nodes, state.relationships));
    return {
      nodes: state.nodes,
      relationships: state.relationships,
      result: {
        applied: false,
        opsApplied: 0,
        flaggedNodeIds: [],
        message: null,
        before: plan.beforeSnapshot,
        after: snap,
      },
    };
  }

  if (options.dryRun) {
    const flaggedNodeIds = plan.ops
      .filter((o): o is Extract<RepairOp, { op: "flag_review" }> => o.op === "flag_review")
      .map((o) => o.nodeId);
    return {
      nodes,
      relationships,
      result: {
        applied: false,
        opsApplied: 0,
        flaggedNodeIds,
        message: plan.summary,
        before: plan.beforeSnapshot,
        after: plan.beforeSnapshot,
      },
    };
  }

  console.info("[family-tree.repair] begin", {
    familyId: scope.familyId,
    peopleOwnerId: scope.peopleOwnerId,
    opCount: plan.ops.length,
    before: plan.beforeSnapshot,
  });

  let opsApplied = 0;
  for (const op of plan.ops) {
    try {
      await applyOp(scope, op, state);
      opsApplied += 1;
    } catch (err) {
      console.error("[family-tree.repair] op failed", {
        familyId: scope.familyId,
        op,
        err,
      });
    }
  }

  const after = snapshotRepairGraph(
    toRepairGraph(state.nodes, state.relationships),
  );
  console.info("[family-tree.repair] done", {
    familyId: scope.familyId,
    peopleOwnerId: scope.peopleOwnerId,
    opsApplied,
    before: plan.beforeSnapshot,
    after,
  });

  const flaggedNodeIds = state.nodes
    .filter((n) => n.notes?.includes("[needs-review]"))
    .map((n) => n.id);

  return {
    nodes: state.nodes,
    relationships: state.relationships,
    result: {
      applied: opsApplied > 0,
      opsApplied,
      flaggedNodeIds,
      message:
        opsApplied > 0
          ? plan.summary ??
            "We fixed some family tree connections for accuracy."
          : null,
      before: plan.beforeSnapshot,
      after,
    },
  };
}
