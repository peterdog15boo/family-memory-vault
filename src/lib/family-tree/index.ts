/**
 * Family tree domain — nodes link to existing People (or temporary placeholders).
 * Scoped to the vault owner (userId). People identities are never shared across
 * family membership; only the owner’s People may be linked. Shared-family media
 * can still appear on those People via the existing face pipeline.
 */

import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  familyTreeNodes,
  familyTreeRelationships,
  people,
  type FamilyTreeNode,
  type FamilyTreeRelationType,
  type FamilyTreeRelationship,
} from "@/lib/db/schema";
import {
  assignGenerationRanks,
  canonicalizeRelationshipEndpoints,
  deriveFamilyTreeEdges,
  isFamilyTreeRelationType,
  type FamilyTreeDerivedEdge,
} from "@/lib/family-tree/types";
import {
  isScaffoldTempKey,
  planFamilyTreeScaffold,
} from "@/lib/family-tree/scaffold";
import { runFamilyTreeRepairPass } from "@/lib/family-tree/repair-apply";
import {
  nodeNeedsReview,
  reviewReasonFromNotes,
  type RepairApplyResult,
} from "@/lib/family-tree/repair";
import { missingCoParentSpouseIds } from "@/lib/family-tree/co-parents";
import {
  coParentLinkNotice,
  coParentsToAutoSpouse,
  spouseLinkNotice,
  type GenealogyIqNotice,
} from "@/lib/family-tree/genealogy-iq";
import type { CousinSide } from "@/lib/family-tree/cousin-side";
import { preferCousinSubjectId } from "@/lib/family-tree/cousin-lineage";
import {
  FAMILY_TREE_CIRCULAR_RELATIONSHIP_MESSAGE,
  validateFamilyTreeRelationship,
  validateFamilyTreeRelationshipBatch,
  type AncestryEdge,
} from "@/lib/family-tree/validate";
import { displayPersonName, getPersonForUser } from "@/lib/people";

export class FamilyTreeError extends Error {
  readonly code?: "plan_limit" | "not_found" | "validation" | "conflict";

  constructor(
    message: string,
    options?: { code?: FamilyTreeError["code"] },
  ) {
    super(message);
    this.name = "FamilyTreeError";
    this.code = options?.code;
  }
}

const labelSchema = z
  .string()
  .trim()
  .min(1, "A name or label is required.")
  .max(120, "Label is too long.");

async function assertFamilyTreeAllowed(userId: string): Promise<void> {
  const { canUseFamilyTree, PlanGateError } = await import("@/lib/plans/gates");
  try {
    const gate = await canUseFamilyTree(userId);
    if (!gate.allowed) {
      throw new FamilyTreeError(
        gate.upgradeHint
          ? `${gate.reason} ${gate.upgradeHint}`
          : (gate.reason ?? "Family Tree is not included on your plan."),
        { code: "plan_limit" },
      );
    }
  } catch (error) {
    if (error instanceof FamilyTreeError) throw error;
    if (error instanceof PlanGateError) {
      throw new FamilyTreeError(error.message, { code: "plan_limit" });
    }
    throw error;
  }
}

async function requireNodeForUser(
  userId: string,
  nodeId: string,
): Promise<FamilyTreeNode> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(familyTreeNodes)
    .where(
      and(eq(familyTreeNodes.id, nodeId), eq(familyTreeNodes.userId, userId)),
    )
    .limit(1);
  if (!row) {
    throw new FamilyTreeError("Tree member not found.", { code: "not_found" });
  }
  return row;
}

export type CreateFamilyTreeNodeInput = {
  userId: string;
  /** Placeholder / display label. */
  label: string;
  /** Link to an existing People identity in this vault. */
  personId?: string | null;
  notes?: string | null;
  /**
   * Atomically attach the new node to an existing member.
   * If the relationship fails, the new node is removed.
   */
  link?: {
    type: FamilyTreeRelationType;
    otherNodeId: string;
    /** Whether the new node is the relationship `from` or `to` endpoint. */
    newNodeIs: "from" | "to";
  };
};

export type CreateFamilyTreeNodeResult = {
  node: FamilyTreeNode;
  /** Genealogy IQ auto-link confirmations (e.g. co-parents linked as spouses). */
  notices: GenealogyIqNotice[];
};

export async function createFamilyTreeNode(
  input: CreateFamilyTreeNodeInput,
): Promise<CreateFamilyTreeNodeResult> {
  await assertFamilyTreeAllowed(input.userId);

  const label = labelSchema.parse(input.label);
  const notes = input.notes?.trim() || null;
  const personId: string | null = input.personId?.trim() || null;
  let resolvedLabel = label;

  if (personId) {
    const person = await getPersonForUser(personId, input.userId);
    if (!person) {
      throw new FamilyTreeError("That person is not in your vault.", {
        code: "not_found",
      });
    }
    // Prefer the People display name when placing from the People list.
    const display = displayPersonName(person.name);
    if (
      !input.label.trim() ||
      input.label.trim() === person.name ||
      input.label.trim() === display
    ) {
      resolvedLabel = display;
    }
  }

  const db = getDb();

  if (personId) {
    const [existing] = await db
      .select({ id: familyTreeNodes.id })
      .from(familyTreeNodes)
      .where(
        and(
          eq(familyTreeNodes.userId, input.userId),
          eq(familyTreeNodes.personId, personId),
        ),
      )
      .limit(1);
    if (existing) {
      throw new FamilyTreeError(
        "That person is already on your family tree.",
        { code: "conflict" },
      );
    }
  }

  // Snapshot existing members — Genealogy IQ never deletes them as a side effect.
  const preservedNodeIds = await listFamilyTreeNodeIds(input.userId);

  const now = new Date();
  const [row] = await db
    .insert(familyTreeNodes)
    .values({
      id: nanoid(),
      userId: input.userId,
      personId,
      label: resolvedLabel,
      notes,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) {
    throw new FamilyTreeError("Could not add tree member.", {
      code: "validation",
    });
  }

  let notices: GenealogyIqNotice[] = [];

  if (input.link) {
    const fromNodeId =
      input.link.newNodeIs === "from" ? row.id : input.link.otherNodeId;
    const toNodeId =
      input.link.newNodeIs === "to" ? row.id : input.link.otherNodeId;
    try {
      const linked = await createFamilyTreeRelationshipWithScaffold({
        userId: input.userId,
        fromNodeId,
        toNodeId,
        type: input.link.type,
        scaffold: false,
      });
      notices = linked.notices;
    } catch (error) {
      await db
        .delete(familyTreeNodes)
        .where(
          and(
            eq(familyTreeNodes.id, row.id),
            eq(familyTreeNodes.userId, input.userId),
          ),
        );
      throw error;
    }
  }

  await assertPreservedFamilyTreeNodes(input.userId, preservedNodeIds);

  return { node: row, notices };
}

export type UpdateFamilyTreeNodeInput = {
  userId: string;
  nodeId: string;
  label?: string;
  notes?: string | null;
  /** Set to link a Person; null to unlink (keep as placeholder). */
  personId?: string | null;
};

export async function updateFamilyTreeNode(
  input: UpdateFamilyTreeNodeInput,
): Promise<FamilyTreeNode> {
  await assertFamilyTreeAllowed(input.userId);
  const existing = await requireNodeForUser(input.userId, input.nodeId);
  const db = getDb();

  let nextLabel = existing.label;
  if (input.label !== undefined) {
    nextLabel = labelSchema.parse(input.label);
  }

  let nextPersonId = existing.personId;
  if (input.personId !== undefined) {
    const raw = input.personId?.trim() || null;
    if (raw) {
      const person = await getPersonForUser(raw, input.userId);
      if (!person) {
        throw new FamilyTreeError("That person is not in your vault.", {
          code: "not_found",
        });
      }
      const [clash] = await db
        .select({ id: familyTreeNodes.id })
        .from(familyTreeNodes)
        .where(
          and(
            eq(familyTreeNodes.userId, input.userId),
            eq(familyTreeNodes.personId, raw),
            ne(familyTreeNodes.id, input.nodeId),
          ),
        )
        .limit(1);
      if (clash) {
        throw new FamilyTreeError(
          "That person is already linked to another tree member.",
          { code: "conflict" },
        );
      }
      nextPersonId = raw;
      if (input.label === undefined) {
        nextLabel = displayPersonName(person.name);
      }
    } else {
      nextPersonId = null;
    }
  }

  const nextNotes =
    input.notes === undefined ? existing.notes : input.notes?.trim() || null;

  const [row] = await db
    .update(familyTreeNodes)
    .set({
      label: nextLabel,
      personId: nextPersonId,
      notes: nextNotes,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(familyTreeNodes.id, input.nodeId),
        eq(familyTreeNodes.userId, input.userId),
      ),
    )
    .returning();

  if (!row) {
    throw new FamilyTreeError("Tree member not found.", { code: "not_found" });
  }
  return row;
}

export async function deleteFamilyTreeNode(
  userId: string,
  nodeId: string,
): Promise<void> {
  await assertFamilyTreeAllowed(userId);
  await requireNodeForUser(userId, nodeId);
  const db = getDb();
  await db
    .delete(familyTreeNodes)
    .where(
      and(eq(familyTreeNodes.id, nodeId), eq(familyTreeNodes.userId, userId)),
    );
}

export type CreateFamilyTreeRelationshipInput = {
  userId: string;
  fromNodeId: string;
  toNodeId: string;
  type: FamilyTreeRelationType | string;
  /** When false, skip auto-placeholders (used while applying a scaffold). */
  scaffold?: boolean;
  /**
   * When false, do not also link the parent's existing spouses as co-parents.
   * Defaults to true for parent_of edges.
   */
  linkSpousesAsCoParents?: boolean;
  /**
   * When false, do not auto-link the new parent with existing parents of the
   * child as spouses. Defaults to true for parent_of edges.
   */
  linkCoParentsAsSpouses?: boolean;
  /** Which parent's side bridges a cousin_of scaffold. */
  cousinSide?: CousinSide;
  /**
   * Force the cousin lineage subject (addCousin person). When omitted,
   * preferCousinSubjectId picks the bloodline peer.
   */
  cousinSubjectId?: string;
};

export type FamilyTreeRelationshipScaffoldResult = {
  relationship: FamilyTreeRelationship;
  scaffold: {
    message: string | null;
    createdNodeIds: string[];
    createdRelationshipIds: string[];
    /**
     * Ids to remove on undo. For cousin/niece/in-law scaffolds this is the
     * auto-created placeholder parents — not the primary peer edge (undoing
     * that edge left people like Scott as relationship orphans).
     */
    undoNodeIds: string[];
    undoRelationshipIds: string[];
  };
  /** Short Genealogy IQ confirmations for auto-links. */
  notices: GenealogyIqNotice[];
};

export async function createFamilyTreeRelationship(
  input: CreateFamilyTreeRelationshipInput,
): Promise<FamilyTreeRelationship> {
  const result = await createFamilyTreeRelationshipWithScaffold(input);
  return result.relationship;
}

/**
 * Create a relationship and, for extended types, the minimum placeholder
 * structure needed for a readable tree.
 */
export async function createFamilyTreeRelationshipWithScaffold(
  input: CreateFamilyTreeRelationshipInput,
): Promise<FamilyTreeRelationshipScaffoldResult> {
  await assertFamilyTreeAllowed(input.userId);

  if (!isFamilyTreeRelationType(input.type)) {
    throw new FamilyTreeError("Unknown relationship type.", {
      code: "validation",
    });
  }

  if (input.fromNodeId === input.toNodeId) {
    throw new FamilyTreeError(FAMILY_TREE_CIRCULAR_RELATIONSHIP_MESSAGE, {
      code: "validation",
    });
  }

  await Promise.all([
    requireNodeForUser(input.userId, input.fromNodeId),
    requireNodeForUser(input.userId, input.toNodeId),
  ]);

  const endpoints = canonicalizeRelationshipEndpoints(
    input.type,
    input.fromNodeId,
    input.toNodeId,
  );

  // Fail fast before creating placeholders.
  {
    const db = getDb();
    const [existing] = await db
      .select({ id: familyTreeRelationships.id })
      .from(familyTreeRelationships)
      .where(
        and(
          eq(familyTreeRelationships.userId, input.userId),
          eq(familyTreeRelationships.fromNodeId, endpoints.fromNodeId),
          eq(familyTreeRelationships.toNodeId, endpoints.toNodeId),
          eq(familyTreeRelationships.type, input.type),
        ),
      )
      .limit(1);
    if (existing) {
      throw new FamilyTreeError("That relationship already exists.", {
        code: "conflict",
      });
    }
  }

  const graph = await getFamilyTreeGraph(input.userId);
  const existingEdges: AncestryEdge[] = graph.relationships.map((r) => ({
    fromNodeId: r.fromNodeId,
    toNodeId: r.toNodeId,
    type: r.type,
  }));
  const preservedNodeIds = graph.nodes.map((n) => n.id);
  const labelById = new Map(graph.nodes.map((n) => [n.id, n.label] as const));

  const shouldScaffold = input.scaffold !== false;
  const createdNodeIds: string[] = [];
  const createdRelationshipIds: string[] = [];
  let scaffoldMessage: string | null = null;
  const notices: GenealogyIqNotice[] = [];

  if (shouldScaffold) {
    const plan = planFamilyTreeScaffold(
      {
        nodes: graph.nodes.map((n) => ({
          id: n.id,
          label: n.label,
          personId: n.personId,
        })),
        relationships: graph.relationships.map((r) => ({
          fromNodeId: r.fromNodeId,
          toNodeId: r.toNodeId,
          type: r.type,
        })),
      },
      {
        fromNodeId: endpoints.fromNodeId,
        toNodeId: endpoints.toNodeId,
        type: input.type,
        cousinSide: input.cousinSide,
        // Prefer the bloodline subject (e.g. Kat over orphan Scott), not
        // lexicographic storage order or whichever connect dropdown was “Who?”.
        cousinSubjectId:
          input.type === "cousin_of"
            ? input.cousinSubjectId === input.fromNodeId ||
              input.cousinSubjectId === input.toNodeId
              ? input.cousinSubjectId
              : preferCousinSubjectId(
                  {
                    nodes: graph.nodes.map((n) => ({
                      id: n.id,
                      label: n.label,
                    })),
                    relationships: graph.relationships.map((r) => ({
                      fromNodeId: r.fromNodeId,
                      toNodeId: r.toNodeId,
                      type: r.type,
                    })),
                  },
                  input.fromNodeId,
                  input.toNodeId,
                )
            : undefined,
      },
    );

    // Pre-validate every planned bridge + the primary edge before writing.
    const proposed: AncestryEdge[] = plan.relationships.map((planned) => ({
      fromNodeId: planned.fromKey,
      toNodeId: planned.toKey,
      type: planned.type,
    }));
    proposed.push({
      fromNodeId: endpoints.fromNodeId,
      toNodeId: endpoints.toNodeId,
      type: input.type,
    });

    const batch = validateFamilyTreeRelationshipBatch(existingEdges, proposed);
    if (!batch.ok) {
      throw new FamilyTreeError(batch.message, { code: "validation" });
    }

    scaffoldMessage = plan.message;
    const keyToId = new Map<string, string>();
    keyToId.set(endpoints.fromNodeId, endpoints.fromNodeId);
    keyToId.set(endpoints.toNodeId, endpoints.toNodeId);

    for (const planned of plan.nodes) {
      const created = await createFamilyTreeNode({
        userId: input.userId,
        label: planned.label,
        personId: null,
      });
      keyToId.set(planned.key, created.node.id);
      createdNodeIds.push(created.node.id);
      labelById.set(created.node.id, created.node.label);
    }

    for (const planned of plan.relationships) {
      const fromId = keyToId.get(planned.fromKey) ?? planned.fromKey;
      const toId = keyToId.get(planned.toKey) ?? planned.toKey;
      if (isScaffoldTempKey(fromId) || isScaffoldTempKey(toId)) {
        continue;
      }
      try {
        const bridge = await createFamilyTreeRelationshipWithScaffold({
          userId: input.userId,
          fromNodeId: fromId,
          toNodeId: toId,
          type: planned.type,
          scaffold: false,
          // Scaffold plans already list every parent/spouse link; don't auto-expand.
          linkSpousesAsCoParents: false,
          linkCoParentsAsSpouses: false,
        });
        createdRelationshipIds.push(bridge.relationship.id);
      } catch (error) {
        // Partial prior scaffolds (orphan cousin with Mom/Dad already) must not
        // block writing the remaining bridges or the primary cousin_of edge.
        if (
          error instanceof FamilyTreeError &&
          (error.code === "conflict" || error.code === "validation")
        ) {
          continue;
        }
        throw error;
      }
    }
  } else {
    const check = validateFamilyTreeRelationship(existingEdges, {
      fromNodeId: endpoints.fromNodeId,
      toNodeId: endpoints.toNodeId,
      type: input.type,
    });
    if (!check.ok) {
      throw new FamilyTreeError(check.message, { code: "validation" });
    }
  }

  const relationship = await insertFamilyTreeRelationship({
    userId: input.userId,
    fromNodeId: endpoints.fromNodeId,
    toNodeId: endpoints.toNodeId,
    type: input.type,
  });

  const autoLinkedIds: string[] = [];
  if (input.type === "parent_of") {
    if (input.linkSpousesAsCoParents !== false) {
      const linked = await linkExistingSpousesAsCoParents({
        userId: input.userId,
        parentNodeId: endpoints.fromNodeId,
        childNodeId: endpoints.toNodeId,
        labelById,
      });
      autoLinkedIds.push(...linked.relationshipIds);
      notices.push(...linked.notices);
    }
    if (input.linkCoParentsAsSpouses !== false) {
      const linked = await linkCoParentsAsSpouses({
        userId: input.userId,
        parentNodeId: endpoints.fromNodeId,
        childNodeId: endpoints.toNodeId,
        labelById,
      });
      autoLinkedIds.push(...linked.relationshipIds);
      notices.push(...linked.notices);
    }
  }

  await assertPreservedFamilyTreeNodes(input.userId, preservedNodeIds);

  // Extended types: undo only auto-placeholders. Keeping the primary edge
  // prevents orphan peers (Scott with no cousin_of) when users tap Undo.
  const undoPrimaryEdge =
    input.type === "parent_of" ||
    input.type === "partner_of" ||
    input.type === "sibling_of" ||
    input.type === "other_relative_of";

  return {
    relationship,
    scaffold: {
      message: scaffoldMessage,
      createdNodeIds,
      createdRelationshipIds: [...createdRelationshipIds, ...autoLinkedIds],
      undoNodeIds: createdNodeIds,
      undoRelationshipIds: undoPrimaryEdge
        ? [relationship.id, ...createdRelationshipIds, ...autoLinkedIds]
        : [...createdRelationshipIds, ...autoLinkedIds],
    },
    notices,
  };
}

async function listFamilyTreeNodeIds(userId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ id: familyTreeNodes.id })
    .from(familyTreeNodes)
    .where(eq(familyTreeNodes.userId, userId));
  return rows.map((r) => r.id);
}

/**
 * Genealogy IQ anti-deletion guard: relationship edits must never remove
 * people who already existed on the tree.
 */
async function assertPreservedFamilyTreeNodes(
  userId: string,
  requiredIds: string[],
): Promise<void> {
  if (requiredIds.length === 0) return;
  const db = getDb();
  const rows = await db
    .select({ id: familyTreeNodes.id })
    .from(familyTreeNodes)
    .where(
      and(
        eq(familyTreeNodes.userId, userId),
        inArray(familyTreeNodes.id, requiredIds),
      ),
    );
  if (rows.length < requiredIds.length) {
    throw new FamilyTreeError(
      "That change would remove people from your tree. It was blocked to keep your family intact.",
      { code: "validation" },
    );
  }
}

/**
 * When Parent A gains a child and already has a spouse, also create
 * parent_of links from that spouse → child so the kid sits under the couple.
 *
 * Genealogy IQ: this only links spouses of the *parent* as co-parents of the
 * child. It never attaches a new parent of person A to person A's spouse.
 */
async function linkExistingSpousesAsCoParents(input: {
  userId: string;
  parentNodeId: string;
  childNodeId: string;
  labelById: Map<string, string>;
}): Promise<{ relationshipIds: string[]; notices: GenealogyIqNotice[] }> {
  const db = getDb();
  const rows = await db
    .select({
      fromNodeId: familyTreeRelationships.fromNodeId,
      toNodeId: familyTreeRelationships.toNodeId,
      type: familyTreeRelationships.type,
    })
    .from(familyTreeRelationships)
    .where(eq(familyTreeRelationships.userId, input.userId));

  const spouseIds = missingCoParentSpouseIds(
    rows,
    input.parentNodeId,
    input.childNodeId,
  );
  if (spouseIds.length === 0) {
    return { relationshipIds: [], notices: [] };
  }

  const relationshipIds: string[] = [];
  const notices: GenealogyIqNotice[] = [];
  const childLabel =
    input.labelById.get(input.childNodeId) ?? "this relative";

  for (const spouseId of spouseIds) {
    try {
      const bridge = await createFamilyTreeRelationshipWithScaffold({
        userId: input.userId,
        fromNodeId: spouseId,
        toNodeId: input.childNodeId,
        type: "parent_of",
        scaffold: false,
        linkSpousesAsCoParents: false,
        linkCoParentsAsSpouses: false,
      });
      relationshipIds.push(bridge.relationship.id);
      notices.push(
        coParentLinkNotice(
          input.labelById.get(spouseId) ?? "Spouse",
          childLabel,
        ),
      );
    } catch (error) {
      // Skip invalid/duplicate co-parent links; the primary parent link stands.
      if (
        error instanceof FamilyTreeError &&
        (error.code === "conflict" || error.code === "validation")
      ) {
        continue;
      }
      throw error;
    }
  }
  return { relationshipIds, notices };
}

/**
 * When a second parent is added to a child, safely link that parent with the
 * existing parent(s) as spouses — e.g. adding Father to Wife when Mother exists.
 */
async function linkCoParentsAsSpouses(input: {
  userId: string;
  parentNodeId: string;
  childNodeId: string;
  labelById: Map<string, string>;
}): Promise<{ relationshipIds: string[]; notices: GenealogyIqNotice[] }> {
  const db = getDb();
  const rows = await db
    .select({
      fromNodeId: familyTreeRelationships.fromNodeId,
      toNodeId: familyTreeRelationships.toNodeId,
      type: familyTreeRelationships.type,
    })
    .from(familyTreeRelationships)
    .where(eq(familyTreeRelationships.userId, input.userId));

  const otherParents = coParentsToAutoSpouse(
    rows,
    input.parentNodeId,
    input.childNodeId,
  );
  if (otherParents.length === 0) {
    return { relationshipIds: [], notices: [] };
  }

  const relationshipIds: string[] = [];
  const notices: GenealogyIqNotice[] = [];
  const newLabel =
    input.labelById.get(input.parentNodeId) ?? "Parent";

  for (const otherId of otherParents) {
    try {
      const bridge = await createFamilyTreeRelationshipWithScaffold({
        userId: input.userId,
        fromNodeId: input.parentNodeId,
        toNodeId: otherId,
        type: "partner_of",
        scaffold: false,
        linkSpousesAsCoParents: false,
        linkCoParentsAsSpouses: false,
      });
      relationshipIds.push(bridge.relationship.id);
      notices.push(
        spouseLinkNotice(
          newLabel,
          input.labelById.get(otherId) ?? "Parent",
        ),
      );
    } catch (error) {
      if (
        error instanceof FamilyTreeError &&
        (error.code === "conflict" || error.code === "validation")
      ) {
        continue;
      }
      throw error;
    }
  }
  return { relationshipIds, notices };
}

async function insertFamilyTreeRelationship(input: {
  userId: string;
  fromNodeId: string;
  toNodeId: string;
  type: FamilyTreeRelationType;
}): Promise<FamilyTreeRelationship> {
  const endpoints = canonicalizeRelationshipEndpoints(
    input.type,
    input.fromNodeId,
    input.toNodeId,
  );

  if (endpoints.fromNodeId === endpoints.toNodeId) {
    throw new FamilyTreeError(FAMILY_TREE_CIRCULAR_RELATIONSHIP_MESSAGE, {
      code: "validation",
    });
  }

  const db = getDb();
  const existingRows = await db
    .select({
      fromNodeId: familyTreeRelationships.fromNodeId,
      toNodeId: familyTreeRelationships.toNodeId,
      type: familyTreeRelationships.type,
    })
    .from(familyTreeRelationships)
    .where(eq(familyTreeRelationships.userId, input.userId));

  const existingEdges: AncestryEdge[] = existingRows.map((r) => ({
    fromNodeId: r.fromNodeId,
    toNodeId: r.toNodeId,
    type: r.type,
  }));

  const duplicate = existingRows.find(
    (r) =>
      r.fromNodeId === endpoints.fromNodeId &&
      r.toNodeId === endpoints.toNodeId &&
      r.type === input.type,
  );
  if (duplicate) {
    throw new FamilyTreeError("That relationship already exists.", {
      code: "conflict",
    });
  }

  const check = validateFamilyTreeRelationship(existingEdges, {
    fromNodeId: endpoints.fromNodeId,
    toNodeId: endpoints.toNodeId,
    type: input.type,
  });
  if (!check.ok) {
    throw new FamilyTreeError(check.message, { code: "validation" });
  }

  // Friendly conflict when the inverse parent link already exists.
  if (input.type === "parent_of") {
    const inverse = existingRows.find(
      (r) =>
        r.type === "parent_of" &&
        r.fromNodeId === endpoints.toNodeId &&
        r.toNodeId === endpoints.fromNodeId,
    );
    if (inverse) {
      throw new FamilyTreeError(FAMILY_TREE_CIRCULAR_RELATIONSHIP_MESSAGE, {
        code: "validation",
      });
    }
  }

  const now = new Date();
  const [row] = await db
    .insert(familyTreeRelationships)
    .values({
      id: nanoid(),
      userId: input.userId,
      fromNodeId: endpoints.fromNodeId,
      toNodeId: endpoints.toNodeId,
      type: input.type,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!row) {
    throw new FamilyTreeError("Could not save relationship.", {
      code: "validation",
    });
  }
  return row;
}

/**
 * Undo a scaffolded relationship create: remove the primary edge and any
 * auto-created placeholder nodes (their edges cascade).
 */
export async function undoFamilyTreeScaffold(input: {
  userId: string;
  relationshipIds: string[];
  nodeIds: string[];
}): Promise<void> {
  await assertFamilyTreeAllowed(input.userId);
  const db = getDb();

  const relIds = [...new Set(input.relationshipIds.filter(Boolean))];
  if (relIds.length > 0) {
    await db
      .delete(familyTreeRelationships)
      .where(
        and(
          eq(familyTreeRelationships.userId, input.userId),
          inArray(familyTreeRelationships.id, relIds),
        ),
      );
  }

  const nodeIds = [...new Set(input.nodeIds.filter(Boolean))];
  if (nodeIds.length > 0) {
    // Only delete placeholders we created (never linked People).
    const placeholders = await db
      .select({ id: familyTreeNodes.id })
      .from(familyTreeNodes)
      .where(
        and(
          eq(familyTreeNodes.userId, input.userId),
          inArray(familyTreeNodes.id, nodeIds),
          sql`${familyTreeNodes.personId} is null`,
        ),
      );
    const deletable = placeholders.map((p) => p.id);
    if (deletable.length > 0) {
      await db
        .delete(familyTreeNodes)
        .where(
          and(
            eq(familyTreeNodes.userId, input.userId),
            inArray(familyTreeNodes.id, deletable),
          ),
        );
    }
  }
}

export async function deleteFamilyTreeRelationship(
  userId: string,
  relationshipId: string,
): Promise<void> {
  await assertFamilyTreeAllowed(userId);
  const db = getDb();
  const deleted = await db
    .delete(familyTreeRelationships)
    .where(
      and(
        eq(familyTreeRelationships.id, relationshipId),
        eq(familyTreeRelationships.userId, userId),
      ),
    )
    .returning({ id: familyTreeRelationships.id });
  if (deleted.length === 0) {
    throw new FamilyTreeError("Relationship not found.", { code: "not_found" });
  }
}

export type FamilyTreePersonPreview = {
  id: string;
  name: string;
  displayName: string;
};

export type FamilyTreeGraphNode = FamilyTreeNode & {
  isPlaceholder: boolean;
  person: FamilyTreePersonPreview | null;
  generation: number;
  needsReview: boolean;
  reviewReason: string | null;
};

export type FamilyTreeGraph = {
  nodes: FamilyTreeGraphNode[];
  relationships: FamilyTreeRelationship[];
  derived: FamilyTreeDerivedEdge[];
  generations: Record<string, number>;
  /** Present when a repair pass ran (or found nothing) on this load. */
  repair: RepairApplyResult | null;
};

/**
 * Load the vault owner's family tree graph.
 * Runs a safe, idempotent repair pass when corruption is detected
 * (unless `skipRepair` is set).
 */
export async function getFamilyTreeGraph(
  userId: string,
  options: { skipRepair?: boolean } = {},
): Promise<FamilyTreeGraph> {
  await assertFamilyTreeAllowed(userId);
  const db = getDb();

  const [rawNodes, rawRelationships] = await Promise.all([
    db
      .select()
      .from(familyTreeNodes)
      .where(eq(familyTreeNodes.userId, userId))
      .orderBy(asc(familyTreeNodes.createdAt)),
    db
      .select()
      .from(familyTreeRelationships)
      .where(eq(familyTreeRelationships.userId, userId))
      .orderBy(asc(familyTreeRelationships.createdAt)),
  ]);

  const repaired = options.skipRepair
    ? {
        nodes: rawNodes,
        relationships: rawRelationships,
        result: {
          applied: false,
          opsApplied: 0,
          flaggedNodeIds: rawNodes
            .filter((n) => nodeNeedsReview(n.notes))
            .map((n) => n.id),
          message: null,
          before: {
            nodeCount: rawNodes.length,
            relationshipCount: rawRelationships.length,
            relationshipKeys: [],
            nodeLabels: {},
          },
          after: {
            nodeCount: rawNodes.length,
            relationshipCount: rawRelationships.length,
            relationshipKeys: [],
            nodeLabels: {},
          },
        } satisfies RepairApplyResult,
      }
    : await runFamilyTreeRepairPass(userId, rawNodes, rawRelationships);
  const nodes = repaired.nodes;
  const relationships = repaired.relationships;

  const personIds = [
    ...new Set(
      nodes
        .map((n) => n.personId)
        .filter((id): id is string => Boolean(id?.trim())),
    ),
  ];

  const personRows =
    personIds.length > 0
      ? await db
          .select({
            id: people.id,
            name: people.name,
          })
          .from(people)
          .where(
            and(eq(people.userId, userId), inArray(people.id, personIds)),
          )
      : [];

  const personById = new Map(
    personRows.map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        displayName: displayPersonName(p.name),
      } satisfies FamilyTreePersonPreview,
    ]),
  );

  const parentEdges = relationships
    .filter((r) => r.type === "parent_of")
    .map((r) => ({ fromNodeId: r.fromNodeId, toNodeId: r.toNodeId }));

  const partnerPairs: Array<readonly [string, string]> = relationships
    .filter((r) => r.type === "partner_of")
    .map((r) => [r.fromNodeId, r.toNodeId] as const);

  const siblingPairs: Array<readonly [string, string]> = relationships
    .filter((r) => r.type === "sibling_of")
    .map((r) => [r.fromNodeId, r.toNodeId] as const);

  const cousinPairs: Array<readonly [string, string]> = relationships
    .filter((r) => r.type === "cousin_of")
    .map((r) => [r.fromNodeId, r.toNodeId] as const);

  const generations = assignGenerationRanks(
    nodes.map((n) => n.id),
    parentEdges,
    { partnerPairs, siblingPairs, cousinPairs },
  );

  const derivedAll = deriveFamilyTreeEdges(parentEdges);
  const explicitSiblingKeys = new Set(
    relationships
      .filter((r) => r.type === "sibling_of")
      .map((r) => `${r.fromNodeId}->${r.toNodeId}`),
  );
  const derived = derivedAll.filter((edge) => {
    if (edge.type !== "sibling_of") return true;
    return !explicitSiblingKeys.has(`${edge.fromNodeId}->${edge.toNodeId}`);
  });

  return {
    nodes: nodes.map((node) => {
      const person =
        node.personId && personById.has(node.personId)
          ? personById.get(node.personId)!
          : null;
      // If person was deleted / inaccessible, treat as placeholder.
      const linked = Boolean(person);
      return {
        ...node,
        personId: linked ? node.personId : null,
        isPlaceholder: !linked,
        person,
        generation: generations[node.id] ?? 0,
        needsReview: nodeNeedsReview(node.notes),
        reviewReason: reviewReasonFromNotes(node.notes),
      };
    }),
    relationships,
    derived,
    generations,
    repair:
      repaired.result.applied ||
      repaired.result.flaggedNodeIds.length > 0 ||
      Boolean(repaired.result.message)
        ? repaired.result
        : null,
  };
}

/** Owner-scoped People not yet placed on this user’s tree (never other members’). */
export async function listPeopleAvailableForTree(
  userId: string,
): Promise<FamilyTreePersonPreview[]> {
  await assertFamilyTreeAllowed(userId);
  const db = getDb();

  const placed = await db
    .select({ personId: familyTreeNodes.personId })
    .from(familyTreeNodes)
    .where(
      and(
        eq(familyTreeNodes.userId, userId),
        sql`${familyTreeNodes.personId} is not null`,
      ),
    );

  const placedIds = new Set(
    placed
      .map((r) => r.personId)
      .filter((id): id is string => Boolean(id)),
  );

  const all = await db
    .select({ id: people.id, name: people.name })
    .from(people)
    .where(eq(people.userId, userId))
    .orderBy(asc(people.name));

  return all
    .filter((p) => !placedIds.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      displayName: displayPersonName(p.name),
    }));
}

export type {
  GenealogyEngineCommand,
  GenealogyEngineResponse,
  GenealogyEngineResult,
  GenealogyEngineNeedsInput,
  GenealogyEngineNeedsInputResult,
} from "@/lib/family-tree/engine";
export { runGenealogyCommand } from "@/lib/family-tree/engine";
