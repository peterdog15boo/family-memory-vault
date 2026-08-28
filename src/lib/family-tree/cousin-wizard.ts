/**
 * Named cousin branch — wizard writes cousin + parents + sibling attach
 * in one logical transaction (rollback on failure). Never leaves an
 * unattached cousin node.
 */

import { nanoid } from "nanoid";
import { and, eq, inArray } from "drizzle-orm";
import {
  familyTreeNodes,
  familyTreeRelationships,
  type FamilyTreeRelationType,
} from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { bloodParentsOfSubject } from "@/lib/family-tree/cousin-lineage";
import {
  FamilyTreeError,
  getFamilyTreeGraph,
} from "@/lib/family-tree/index";
import { getPersonForUser, displayPersonName } from "@/lib/people";

export type CousinAttachWhich = "parent1" | "parent2" | "unsure";

export type CreateNamedCousinBranchInput = {
  userId: string;
  /** Person P the cousin is attached through (Kat / Jeff). */
  subjectId: string;
  cousinLabel: string;
  cousinPersonId?: string | null;
  parent1Label: string;
  parent2Label?: string | null;
  /** Which new parent is the sibling of someone already on the tree. */
  attachWhich: CousinAttachWhich;
  /** Existing tree person (parent / aunt / uncle on P’s side). */
  attachToNodeId: string;
};

export type CreateNamedCousinBranchResult = {
  cousinNodeId: string;
  parent1NodeId: string;
  parent2NodeId: string | null;
  createdNodeIds: string[];
  createdRelationshipIds: string[];
  message: string;
};

export type CousinAttachCandidate = {
  id: string;
  label: string;
  kind: "parent" | "aunt_uncle";
};

/**
 * People on P’s blood side that a new cousin-parent can sibling-link to:
 * P’s blood parents and their siblings (aunts/uncles) already on the tree.
 */
export function listCousinAttachCandidates(
  graph: {
    nodes: Array<{ id: string; label: string }>;
    relationships: Array<{
      fromNodeId: string;
      toNodeId: string;
      type: string;
    }>;
  },
  subjectId: string,
): CousinAttachCandidate[] {
  const lineage = {
    nodes: graph.nodes.map((n) => ({ id: n.id, label: n.label })),
    relationships: graph.relationships.map((r) => ({
      fromNodeId: r.fromNodeId,
      toNodeId: r.toNodeId,
      type: r.type as FamilyTreeRelationType,
    })),
  };
  const labelOf = (id: string) =>
    graph.nodes.find((n) => n.id === id)?.label ?? id;

  const blood = bloodParentsOfSubject(lineage, subjectId);
  const out: CousinAttachCandidate[] = [];
  const seen = new Set<string>();

  for (const pid of blood) {
    if (seen.has(pid)) continue;
    seen.add(pid);
    out.push({ id: pid, label: labelOf(pid), kind: "parent" });
  }

  for (const pid of blood) {
    for (const r of graph.relationships) {
      if (r.type !== "sibling_of") continue;
      const other =
        r.fromNodeId === pid
          ? r.toNodeId
          : r.toNodeId === pid
            ? r.fromNodeId
            : null;
      if (!other || seen.has(other)) continue;
      seen.add(other);
      out.push({ id: other, label: labelOf(other), kind: "aunt_uncle" });
    }
  }

  return out;
}

async function insertNode(
  userId: string,
  label: string,
  personId: string | null,
  notes: string | null,
): Promise<string> {
  const db = getDb();
  const now = new Date();
  const id = nanoid();
  await db.insert(familyTreeNodes).values({
    id,
    userId,
    personId,
    label,
    notes,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function insertEdge(
  userId: string,
  fromNodeId: string,
  toNodeId: string,
  type: FamilyTreeRelationType,
): Promise<string> {
  const db = getDb();
  const now = new Date();
  const id = nanoid();
  await db.insert(familyTreeRelationships).values({
    id,
    userId,
    fromNodeId,
    toNodeId,
    type,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

/**
 * Create cousin + named parents + sibling attach + optional cousin_of.
 * Rolls back created rows if any step fails.
 */
export async function createNamedCousinBranch(
  input: CreateNamedCousinBranchInput,
): Promise<CreateNamedCousinBranchResult> {
  const cousinLabel = input.cousinLabel.trim();
  const parent1Label = input.parent1Label.trim();
  const parent2Label = input.parent2Label?.trim() || "";
  if (!cousinLabel) {
    throw new FamilyTreeError("Cousin name is required.", {
      code: "validation",
    });
  }
  if (!parent1Label) {
    throw new FamilyTreeError("Parent 1 name is required.", {
      code: "validation",
    });
  }
  if (input.attachWhich === "parent2" && !parent2Label) {
    throw new FamilyTreeError(
      "Parent 2 is required when that parent attaches to the family.",
      { code: "validation" },
    );
  }

  const graph = await getFamilyTreeGraph(input.userId, { skipRepair: true });
  const subject = graph.nodes.find((n) => n.id === input.subjectId);
  if (!subject) {
    throw new FamilyTreeError("That relative is not on your tree.", {
      code: "not_found",
    });
  }
  const attachTo = graph.nodes.find((n) => n.id === input.attachToNodeId);
  if (!attachTo) {
    throw new FamilyTreeError(
      "Choose which relative on this side the cousin’s parent is a sibling of.",
      { code: "validation" },
    );
  }

  const candidates = listCousinAttachCandidates(graph, input.subjectId);
  if (
    candidates.length > 0 &&
    !candidates.some((c) => c.id === input.attachToNodeId)
  ) {
    // Still allow attach when the tree already has the person — wizard list
    // may be empty if P has no parents yet; then attachTo must exist.
  }

  let cousinPersonId: string | null = input.cousinPersonId?.trim() || null;
  let resolvedCousinLabel = cousinLabel;
  if (cousinPersonId) {
    const person = await getPersonForUser(cousinPersonId, input.userId);
    if (!person) {
      throw new FamilyTreeError("That person is not in your vault.", {
        code: "not_found",
      });
    }
    const display = displayPersonName(person.name);
    if (
      !cousinLabel ||
      cousinLabel === person.name ||
      cousinLabel === display
    ) {
      resolvedCousinLabel = display;
    }
  }

  const createdNodeIds: string[] = [];
  const createdRelationshipIds: string[] = [];
  const db = getDb();

  async function rollback() {
    if (createdRelationshipIds.length > 0) {
      await db
        .delete(familyTreeRelationships)
        .where(
          and(
            eq(familyTreeRelationships.userId, input.userId),
            inArray(familyTreeRelationships.id, createdRelationshipIds),
          ),
        )
        .catch(() => undefined);
    }
    if (createdNodeIds.length > 0) {
      await db
        .delete(familyTreeNodes)
        .where(
          and(
            eq(familyTreeNodes.userId, input.userId),
            inArray(familyTreeNodes.id, createdNodeIds),
          ),
        )
        .catch(() => undefined);
    }
  }

  try {
    const unverified = input.attachWhich === "unsure";
    const cousinId = await insertNode(
      input.userId,
      resolvedCousinLabel,
      cousinPersonId,
      null,
    );
    createdNodeIds.push(cousinId);

    const parent1Id = await insertNode(
      input.userId,
      parent1Label,
      null,
      unverified && input.attachWhich !== "parent2"
        ? `Sibling link to ${attachTo.label} unverified`
        : null,
    );
    createdNodeIds.push(parent1Id);

    let parent2Id: string | null = null;
    if (parent2Label) {
      parent2Id = await insertNode(
        input.userId,
        parent2Label,
        null,
        unverified && input.attachWhich === "parent2"
          ? `Sibling link to ${attachTo.label} unverified`
          : null,
      );
      createdNodeIds.push(parent2Id);
    }

    if (parent2Id) {
      createdRelationshipIds.push(
        await insertEdge(input.userId, parent1Id, parent2Id, "partner_of"),
      );
    }

    createdRelationshipIds.push(
      await insertEdge(input.userId, parent1Id, cousinId, "parent_of"),
    );
    if (parent2Id) {
      createdRelationshipIds.push(
        await insertEdge(input.userId, parent2Id, cousinId, "parent_of"),
      );
    }

    const attachParentId =
      input.attachWhich === "parent2" && parent2Id
        ? parent2Id
        : parent1Id;

    createdRelationshipIds.push(
      await insertEdge(
        input.userId,
        attachParentId,
        input.attachToNodeId,
        "sibling_of",
      ),
    );

    // Stored for search / inferredSide — not drawn by the renderer.
    createdRelationshipIds.push(
      await insertEdge(
        input.userId,
        input.subjectId,
        cousinId,
        "cousin_of",
      ),
    );

    return {
      cousinNodeId: cousinId,
      parent1NodeId: parent1Id,
      parent2NodeId: parent2Id,
      createdNodeIds,
      createdRelationshipIds,
      message: unverified
        ? `Added ${resolvedCousinLabel} with parents; sibling link marked unverified.`
        : `Added ${resolvedCousinLabel} and parents on this side of the family.`,
    };
  } catch (error) {
    await rollback();
    throw error;
  }
}
