/**
 * Family tree domain — nodes link to existing People (or temporary placeholders).
 * Scoped by familyId (one tree per family). People links use peopleOwnerId
 * (family creator vault). Shared-family media can still appear on those People
 * via the existing face pipeline.
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
  missingChildrenForNewSpouse,
  spouseLinkNotice,
  type GenealogyIqNotice,
} from "@/lib/family-tree/genealogy-iq";
import type { CousinSide } from "@/lib/family-tree/cousin-side";
import { preferCousinSubjectId } from "@/lib/family-tree/cousin-lineage";
import { missingSharedSiblingParentLinks } from "@/lib/family-tree/sibling-parents";
import {
  FAMILY_TREE_CIRCULAR_RELATIONSHIP_MESSAGE,
  validateFamilyTreeRelationship,
  validateFamilyTreeRelationshipBatch,
  type AncestryEdge,
} from "@/lib/family-tree/validate";
import { displayPersonName, getPersonForUser } from "@/lib/people";
import type { FamilyTreeScope } from "@/lib/family-tree/scope";

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

async function requireNodeInScope(
  scope: FamilyTreeScope,
  nodeId: string,
): Promise<FamilyTreeNode> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(familyTreeNodes)
    .where(
      and(
        eq(familyTreeNodes.id, nodeId),
        eq(familyTreeNodes.familyId, scope.familyId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new FamilyTreeError("Tree member not found.", { code: "not_found" });
  }
  return row;
}

export type CreateFamilyTreeNodeInput = {
  scope: FamilyTreeScope;
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
    /** Child ids to skip when auto-linking a new spouse as co-parent. */
    excludeChildIds?: string[];
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
  await assertFamilyTreeAllowed(input.scope.peopleOwnerId);

  const label = labelSchema.parse(input.label);
  const notes = input.notes?.trim() || null;
  const personId: string | null = input.personId?.trim() || null;
  let resolvedLabel = label;

  if (personId) {
    const person = await getPersonForUser(personId, input.scope.peopleOwnerId);
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
          eq(familyTreeNodes.familyId, input.scope.familyId),
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
  const preservedNodeIds = await listFamilyTreeNodeIds(input.scope);

  const now = new Date();
  const [row] = await db
    .insert(familyTreeNodes)
    .values({
      id: nanoid(),
      userId: input.scope.peopleOwnerId,
      familyId: input.scope.familyId,
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
        scope: input.scope,
        fromNodeId,
        toNodeId,
        type: input.link.type,
        scaffold: false,
        excludeChildIds: input.link.excludeChildIds,
      });
      notices = linked.notices;
    } catch (error) {
      await db
        .delete(familyTreeNodes)
        .where(
          and(
            eq(familyTreeNodes.id, row.id),
            eq(familyTreeNodes.familyId, input.scope.familyId),
          ),
        );
      throw error;
    }
  }

  await assertPreservedFamilyTreeNodes(input.scope, preservedNodeIds);

  return { node: row, notices };
}

export type UpdateFamilyTreeNodeInput = {
  scope: FamilyTreeScope;
  nodeId: string;
  label?: string;
  notes?: string | null;
  /** Set to link a Person; null to unlink (keep as placeholder). */
  personId?: string | null;
};

export async function updateFamilyTreeNode(
  input: UpdateFamilyTreeNodeInput,
): Promise<FamilyTreeNode> {
  await assertFamilyTreeAllowed(input.scope.peopleOwnerId);
  const existing = await requireNodeInScope(input.scope, input.nodeId);
  const db = getDb();

  let nextLabel = existing.label;
  if (input.label !== undefined) {
    nextLabel = labelSchema.parse(input.label);
  }

  let nextPersonId = existing.personId;
  if (input.personId !== undefined) {
    const raw = input.personId?.trim() || null;
    if (raw) {
      const person = await getPersonForUser(raw, input.scope.peopleOwnerId);
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
            eq(familyTreeNodes.familyId, input.scope.familyId),
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
        eq(familyTreeNodes.familyId, input.scope.familyId),
      ),
    )
    .returning();

  if (!row) {
    throw new FamilyTreeError("Tree member not found.", { code: "not_found" });
  }
  return row;
}

export async function deleteFamilyTreeNode(
  scope: FamilyTreeScope,
  nodeId: string,
): Promise<void> {
  await assertFamilyTreeAllowed(scope.peopleOwnerId);
  await requireNodeInScope(scope, nodeId);
  const db = getDb();
  await db
    .delete(familyTreeNodes)
    .where(
      and(
        eq(familyTreeNodes.id, nodeId),
        eq(familyTreeNodes.familyId, scope.familyId),
      ),
    );
}

export type CreateFamilyTreeRelationshipInput = {
  scope: FamilyTreeScope;
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
  /**
   * When false, do not copy parent_of→children onto a newly linked spouse.
   * Defaults to true for partner_of edges.
   */
  linkSpouseAsParentOfExistingChildren?: boolean;
  /**
   * Child node ids to skip when auto-linking a new spouse as co-parent
   * (“not this child’s parent”).
   */
  excludeChildIds?: string[];
  /**
   * When set, only these spouses of the new parent are linked as co-parents.
   * Empty array = no spouse co-parents. Omit to link all spouses (default).
   */
  coParentSpouseIds?: string[];
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
  await assertFamilyTreeAllowed(input.scope.peopleOwnerId);

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
    requireNodeInScope(input.scope, input.fromNodeId),
    requireNodeInScope(input.scope, input.toNodeId),
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
          eq(familyTreeRelationships.familyId, input.scope.familyId),
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

  const graph = await getFamilyTreeGraph(input.scope);
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
        scope: input.scope,
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
          scope: input.scope,
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
    scope: input.scope,
    fromNodeId: endpoints.fromNodeId,
    toNodeId: endpoints.toNodeId,
    type: input.type,
  });

  const autoLinkedIds: string[] = [];
  if (input.type === "parent_of") {
    if (input.linkSpousesAsCoParents !== false) {
      const linked = await linkExistingSpousesAsCoParents({
        scope: input.scope,
        parentNodeId: endpoints.fromNodeId,
        childNodeId: endpoints.toNodeId,
        labelById,
        includeSpouseIds: input.coParentSpouseIds,
      });
      autoLinkedIds.push(...linked.relationshipIds);
      notices.push(...linked.notices);
    }
    if (input.linkCoParentsAsSpouses !== false) {
      const linked = await linkCoParentsAsSpouses({
        scope: input.scope,
        parentNodeId: endpoints.fromNodeId,
        childNodeId: endpoints.toNodeId,
        labelById,
      });
      autoLinkedIds.push(...linked.relationshipIds);
      notices.push(...linked.notices);
    }
  }

  if (input.type === "sibling_of") {
    const linked = await linkSharedSiblingParents({
      scope: input.scope,
      siblingA: endpoints.fromNodeId,
      siblingB: endpoints.toNodeId,
      labelById,
    });
    autoLinkedIds.push(...linked.relationshipIds);
    notices.push(...linked.notices);
  }

  if (
    input.type === "partner_of" &&
    input.linkSpouseAsParentOfExistingChildren !== false
  ) {
    const linked = await linkNewSpouseAsParentOfExistingChildren({
      scope: input.scope,
      spouseA: endpoints.fromNodeId,
      spouseB: endpoints.toNodeId,
      labelById,
      excludeChildIds: input.excludeChildIds ?? [],
    });
    autoLinkedIds.push(...linked.relationshipIds);
    notices.push(...linked.notices);
  }

  await assertPreservedFamilyTreeNodes(input.scope, preservedNodeIds);

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

async function listFamilyTreeNodeIds(scope: FamilyTreeScope): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ id: familyTreeNodes.id })
    .from(familyTreeNodes)
    .where(eq(familyTreeNodes.familyId, scope.familyId));
  return rows.map((r) => r.id);
}

/**
 * Genealogy IQ anti-deletion guard: relationship edits must never remove
 * people who already existed on the tree.
 */
async function assertPreservedFamilyTreeNodes(
  scope: FamilyTreeScope,
  requiredIds: string[],
): Promise<void> {
  if (requiredIds.length === 0) return;
  const db = getDb();
  const rows = await db
    .select({ id: familyTreeNodes.id })
    .from(familyTreeNodes)
    .where(
      and(
        eq(familyTreeNodes.familyId, scope.familyId),
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
 * When siblings are linked and one already has parents, attach the other to
 * that same parent union (Donna joins Diane+Frank when sibling_of Kat).
 */
async function linkSharedSiblingParents(input: {
  scope: FamilyTreeScope;
  siblingA: string;
  siblingB: string;
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
    .where(eq(familyTreeRelationships.familyId, input.scope.familyId));

  const missing = missingSharedSiblingParentLinks(
    rows,
    input.siblingA,
    input.siblingB,
  );
  if (missing.length === 0) {
    return { relationshipIds: [], notices: [] };
  }

  const relationshipIds: string[] = [];
  const notices: GenealogyIqNotice[] = [];
  for (const { parentId, childId } of missing) {
    try {
      const bridge = await createFamilyTreeRelationshipWithScaffold({
        scope: input.scope,
        fromNodeId: parentId,
        toNodeId: childId,
        type: "parent_of",
        scaffold: false,
        linkSpousesAsCoParents: false,
        linkCoParentsAsSpouses: false,
      });
      relationshipIds.push(bridge.relationship.id);
      notices.push({
        kind: "sibling_parent_link",
        message: `Linked ${input.labelById.get(childId) ?? "sibling"} to the same parents as their brother or sister.`,
      });
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

/**
 * When A and B become spouses: if one already has children and the other
 * does not have a separate set of their own, copy parent_of onto the new
 * spouse so the kids sit under the couple (Danielle+Rob → Nova).
 */
async function linkNewSpouseAsParentOfExistingChildren(input: {
  scope: FamilyTreeScope;
  spouseA: string;
  spouseB: string;
  labelById: Map<string, string>;
  excludeChildIds?: string[];
}): Promise<{ relationshipIds: string[]; notices: GenealogyIqNotice[] }> {
  const db = getDb();
  const rows = await db
    .select({
      fromNodeId: familyTreeRelationships.fromNodeId,
      toNodeId: familyTreeRelationships.toNodeId,
      type: familyTreeRelationships.type,
    })
    .from(familyTreeRelationships)
    .where(eq(familyTreeRelationships.familyId, input.scope.familyId));

  const exclude = input.excludeChildIds ?? [];
  const pairs: Array<{ parentId: string; childId: string }> = [];
  for (const childId of missingChildrenForNewSpouse(
    rows,
    input.spouseA,
    input.spouseB,
    exclude,
  )) {
    pairs.push({ parentId: input.spouseB, childId });
  }
  for (const childId of missingChildrenForNewSpouse(
    rows,
    input.spouseB,
    input.spouseA,
    exclude,
  )) {
    pairs.push({ parentId: input.spouseA, childId });
  }

  const relationshipIds: string[] = [];
  const notices: GenealogyIqNotice[] = [];
  for (const { parentId, childId } of pairs) {
    try {
      const bridge = await createFamilyTreeRelationshipWithScaffold({
        scope: input.scope,
        fromNodeId: parentId,
        toNodeId: childId,
        type: "parent_of",
        scaffold: false,
        linkSpousesAsCoParents: false,
        linkCoParentsAsSpouses: false,
        linkSpouseAsParentOfExistingChildren: false,
      });
      relationshipIds.push(bridge.relationship.id);
      notices.push(
        coParentLinkNotice(
          input.labelById.get(parentId) ?? "Spouse",
          input.labelById.get(childId) ?? "this relative",
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

/**
 * When Parent A gains a child and already has a spouse, also create
 * parent_of links from that spouse → child so the kid sits under the couple.
 *
 * Genealogy IQ: this only links spouses of the *parent* as co-parents of the
 * child. It never attaches a new parent of person A to person A's spouse.
 */
async function linkExistingSpousesAsCoParents(input: {
  scope: FamilyTreeScope;
  parentNodeId: string;
  childNodeId: string;
  labelById: Map<string, string>;
  /** When set, only these spouse ids are linked (empty = none). */
  includeSpouseIds?: string[];
}): Promise<{ relationshipIds: string[]; notices: GenealogyIqNotice[] }> {
  const db = getDb();
  const rows = await db
    .select({
      fromNodeId: familyTreeRelationships.fromNodeId,
      toNodeId: familyTreeRelationships.toNodeId,
      type: familyTreeRelationships.type,
    })
    .from(familyTreeRelationships)
    .where(eq(familyTreeRelationships.familyId, input.scope.familyId));

  let spouseIds = missingCoParentSpouseIds(
    rows,
    input.parentNodeId,
    input.childNodeId,
  );
  if (input.includeSpouseIds !== undefined) {
    const allow = new Set(input.includeSpouseIds);
    spouseIds = spouseIds.filter((id) => allow.has(id));
  }
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
        scope: input.scope,
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
  scope: FamilyTreeScope;
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
    .where(eq(familyTreeRelationships.familyId, input.scope.familyId));

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
        scope: input.scope,
        fromNodeId: input.parentNodeId,
        toNodeId: otherId,
        type: "partner_of",
        scaffold: false,
        linkSpousesAsCoParents: false,
        linkCoParentsAsSpouses: false,
        linkSpouseAsParentOfExistingChildren: false,
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
  scope: FamilyTreeScope;
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
    .where(eq(familyTreeRelationships.familyId, input.scope.familyId));

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
      userId: input.scope.peopleOwnerId,
      familyId: input.scope.familyId,
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
  scope: FamilyTreeScope;
  relationshipIds: string[];
  nodeIds: string[];
}): Promise<void> {
  await assertFamilyTreeAllowed(input.scope.peopleOwnerId);
  const db = getDb();

  const relIds = [...new Set(input.relationshipIds.filter(Boolean))];
  if (relIds.length > 0) {
    await db
      .delete(familyTreeRelationships)
      .where(
        and(
          eq(familyTreeRelationships.familyId, input.scope.familyId),
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
          eq(familyTreeNodes.familyId, input.scope.familyId),
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
            eq(familyTreeNodes.familyId, input.scope.familyId),
            inArray(familyTreeNodes.id, deletable),
          ),
        );
    }
  }
}

export async function deleteFamilyTreeRelationship(
  scope: FamilyTreeScope,
  relationshipId: string,
): Promise<void> {
  await assertFamilyTreeAllowed(scope.peopleOwnerId);
  const db = getDb();
  const deleted = await db
    .delete(familyTreeRelationships)
    .where(
      and(
        eq(familyTreeRelationships.id, relationshipId),
        eq(familyTreeRelationships.familyId, scope.familyId),
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
 * Load a family's tree graph (scoped by familyId).
 * Runs a safe, idempotent repair pass when corruption is detected
 * (unless `skipRepair` is set).
 */
export async function getFamilyTreeGraph(
  scope: FamilyTreeScope,
  options: { skipRepair?: boolean } = {},
): Promise<FamilyTreeGraph> {
  await assertFamilyTreeAllowed(scope.peopleOwnerId);
  const db = getDb();

  const [rawNodes, rawRelationships] = await Promise.all([
    db
      .select()
      .from(familyTreeNodes)
      .where(eq(familyTreeNodes.familyId, scope.familyId))
      .orderBy(asc(familyTreeNodes.createdAt)),
    db
      .select()
      .from(familyTreeRelationships)
      .where(eq(familyTreeRelationships.familyId, scope.familyId))
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
    : await runFamilyTreeRepairPass(scope, rawNodes, rawRelationships);
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
            and(eq(people.userId, scope.peopleOwnerId), inArray(people.id, personIds)),
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

/** People from peopleOwnerId vault not yet placed on this family's tree. */
export async function listPeopleAvailableForTree(
  scope: FamilyTreeScope,
): Promise<FamilyTreePersonPreview[]> {
  await assertFamilyTreeAllowed(scope.peopleOwnerId);
  const db = getDb();

  const placed = await db
    .select({ personId: familyTreeNodes.personId })
    .from(familyTreeNodes)
    .where(
      and(
        eq(familyTreeNodes.familyId, scope.familyId),
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
    .where(eq(people.userId, scope.peopleOwnerId))
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
