/**
 * Genealogy Relationship Engine — sole authority for Family Tree mutations.
 *
 * UI / API must call these commands. They never invent merged people, and they
 * re-read the graph after every successful write.
 *
 * Layout remains a pure renderer of the graph snapshot; it must not write edges.
 */

import {
  createFamilyTreeNode,
  createFamilyTreeRelationshipWithScaffold,
  deleteFamilyTreeNode,
  deleteFamilyTreeRelationship,
  getFamilyTreeGraph,
  undoFamilyTreeScaffold,
  updateFamilyTreeNode,
  FamilyTreeError,
  type FamilyTreeGraph,
  type FamilyTreeRelationshipScaffoldResult,
} from "@/lib/family-tree/index";
import {
  cousinSidePromptMessage,
  shouldAskCousinSide,
  type CousinSide,
} from "@/lib/family-tree/cousin-side";
import { preferredExistingCoParentId } from "@/lib/family-tree/genealogy-iq";
import type { GenealogyIqNotice } from "@/lib/family-tree/genealogy-iq";
import { clearReviewFlag } from "@/lib/family-tree/repair";
import type { FamilyTreeRelationType } from "@/lib/db/schema";

export type GenealogyEngineCommand =
  | {
      type: "addSpouse";
      personId: string;
      spouseNodeId?: string;
      label?: string;
    }
  | {
      type: "addParent";
      personId: string;
      parentNodeId?: string;
      label?: string;
    }
  | {
      type: "addChild";
      personId: string;
      childNodeId?: string;
      label?: string;
      /** When true, do not also link the parent's existing spouse. */
      oneParentOnly?: boolean;
    }
  | {
      type: "addSibling";
      personId: string;
      siblingNodeId?: string;
      label?: string;
    }
  | {
      type: "addCousin";
      personId: string;
      cousinNodeId?: string;
      label?: string;
      side?: CousinSide;
    }
  | {
      type: "connect";
      fromNodeId: string;
      toNodeId: string;
      relationType: FamilyTreeRelationType;
      cousinSide?: CousinSide;
      oneParentOnly?: boolean;
    }
  | { type: "placePerson"; peopleId: string; label?: string }
  | { type: "addPlaceholder"; label: string }
  | {
      type: "linkPlaceholderToPerson";
      nodeId: string;
      peopleId: string | null;
    }
  | {
      type: "renameNode";
      nodeId: string;
      label?: string;
      notes?: string | null;
    }
  | { type: "removeRelationship"; edgeId: string }
  | { type: "deleteNode"; nodeId: string }
  | {
      type: "undoScaffold";
      nodeIds: string[];
      relationshipIds: string[];
    }
  | { type: "repairTree"; dryRun?: boolean }
  | { type: "clearNodeReview"; nodeId: string };

export type GenealogyEngineNeedsInput = {
  kind: "cousinSide";
  message: string;
  /** Person whose parents define maternal/paternal sides. */
  personId: string;
};

export type GenealogyEngineResult = {
  ok: true;
  tree: FamilyTreeGraph;
  notices: GenealogyIqNotice[];
  scaffold: FamilyTreeRelationshipScaffoldResult["scaffold"] | null;
  /** Primary node created or focused by the command, when applicable. */
  focusNodeId?: string;
  needsInput?: undefined;
};

export type GenealogyEngineNeedsInputResult = {
  ok: false;
  needsInput: GenealogyEngineNeedsInput;
  tree: FamilyTreeGraph;
  notices: [];
  scaffold: null;
};

export type GenealogyEngineResponse =
  | GenealogyEngineResult
  | GenealogyEngineNeedsInputResult;

function emptyScaffold(): FamilyTreeRelationshipScaffoldResult["scaffold"] {
  return {
    message: null,
    createdNodeIds: [],
    createdRelationshipIds: [],
    undoNodeIds: [],
    undoRelationshipIds: [],
  };
}

function parentIdsOf(
  tree: FamilyTreeGraph,
  childId: string,
): string[] {
  return tree.relationships
    .filter((r) => r.type === "parent_of" && r.toNodeId === childId)
    .map((r) => r.fromNodeId);
}

async function snapshot(
  userId: string,
  notices: GenealogyIqNotice[] = [],
  scaffold: FamilyTreeRelationshipScaffoldResult["scaffold"] | null = null,
  focusNodeId?: string,
): Promise<GenealogyEngineResult> {
  const tree = await getFamilyTreeGraph(userId);
  return {
    ok: true,
    tree,
    notices,
    scaffold:
      scaffold &&
      (scaffold.message ||
        scaffold.createdNodeIds.length > 0 ||
        scaffold.createdRelationshipIds.length > 0)
        ? scaffold
        : null,
    focusNodeId,
  };
}

/**
 * Execute one Genealogy Relationship Engine command.
 * This is the only supported write path for Family Tree graph edits.
 */
export async function runGenealogyCommand(
  userId: string,
  command: GenealogyEngineCommand,
): Promise<GenealogyEngineResponse> {
  switch (command.type) {
    case "addPlaceholder": {
      const created = await createFamilyTreeNode({
        userId,
        label: command.label,
      });
      return snapshot(userId, created.notices, null, created.node.id);
    }

    case "placePerson": {
      const created = await createFamilyTreeNode({
        userId,
        label: command.label?.trim() || "Person",
        personId: command.peopleId,
      });
      return snapshot(userId, created.notices, null, created.node.id);
    }

    case "renameNode": {
      if (command.label === undefined && command.notes === undefined) {
        throw new FamilyTreeError("Rename requires a label or notes.", {
          code: "validation",
        });
      }
      await updateFamilyTreeNode({
        userId,
        nodeId: command.nodeId,
        ...(command.label !== undefined ? { label: command.label } : {}),
        ...(command.notes !== undefined ? { notes: command.notes } : {}),
      });
      return snapshot(userId, [], null, command.nodeId);
    }

    case "linkPlaceholderToPerson": {
      await updateFamilyTreeNode({
        userId,
        nodeId: command.nodeId,
        personId: command.peopleId,
      });
      return snapshot(userId, [], null, command.nodeId);
    }

    case "clearNodeReview": {
      const tree = await getFamilyTreeGraph(userId, { skipRepair: true });
      const node = tree.nodes.find((n) => n.id === command.nodeId);
      if (!node) {
        throw new FamilyTreeError("Tree member not found.", {
          code: "not_found",
        });
      }
      await updateFamilyTreeNode({
        userId,
        nodeId: command.nodeId,
        notes: clearReviewFlag(node.notes),
      });
      return snapshot(userId, [], null, command.nodeId);
    }

    case "removeRelationship": {
      await deleteFamilyTreeRelationship(userId, command.edgeId);
      return snapshot(userId);
    }

    case "deleteNode": {
      await deleteFamilyTreeNode(userId, command.nodeId);
      return snapshot(userId);
    }

    case "undoScaffold": {
      await undoFamilyTreeScaffold({
        userId,
        nodeIds: command.nodeIds,
        relationshipIds: command.relationshipIds,
      });
      return snapshot(userId);
    }

    case "addSpouse": {
      if (command.spouseNodeId) {
        const result = await createFamilyTreeRelationshipWithScaffold({
          userId,
          fromNodeId: command.personId,
          toNodeId: command.spouseNodeId,
          type: "partner_of",
          scaffold: false,
        });
        return snapshot(
          userId,
          result.notices,
          result.scaffold,
          command.spouseNodeId,
        );
      }
      const created = await createFamilyTreeNode({
        userId,
        label: command.label?.trim() || "Spouse",
        link: {
          type: "partner_of",
          otherNodeId: command.personId,
          newNodeIs: "from",
        },
      });
      return snapshot(userId, created.notices, null, created.node.id);
    }

    case "addParent": {
      const tree = await getFamilyTreeGraph(userId);
      if (command.parentNodeId) {
        const result = await createFamilyTreeRelationshipWithScaffold({
          userId,
          fromNodeId: command.parentNodeId,
          toNodeId: command.personId,
          type: "parent_of",
          scaffold: false,
        });
        return snapshot(
          userId,
          result.notices,
          result.scaffold,
          command.parentNodeId,
        );
      }

      const existingSpouse = preferredExistingCoParentId(
        tree.relationships,
        command.personId,
      );
      if (existingSpouse) {
        const result = await createFamilyTreeRelationshipWithScaffold({
          userId,
          fromNodeId: existingSpouse,
          toNodeId: command.personId,
          type: "parent_of",
          scaffold: false,
        });
        return snapshot(
          userId,
          result.notices,
          result.scaffold,
          existingSpouse,
        );
      }

      const parentCount = parentIdsOf(tree, command.personId).length;
      if (parentCount >= 2) {
        throw new FamilyTreeError(
          "This person already has two parents. Link an existing relative instead of adding another parent.",
          { code: "validation" },
        );
      }

      const created = await createFamilyTreeNode({
        userId,
        label: command.label?.trim() || "Parent",
        link: {
          type: "parent_of",
          otherNodeId: command.personId,
          newNodeIs: "from",
        },
      });
      return snapshot(userId, created.notices, null, created.node.id);
    }

    case "addChild": {
      if (command.childNodeId) {
        const result = await createFamilyTreeRelationshipWithScaffold({
          userId,
          fromNodeId: command.personId,
          toNodeId: command.childNodeId,
          type: "parent_of",
          scaffold: false,
          linkSpousesAsCoParents: !command.oneParentOnly,
        });
        return snapshot(
          userId,
          result.notices,
          result.scaffold,
          command.childNodeId,
        );
      }

      if (command.oneParentOnly) {
        const created = await createFamilyTreeNode({
          userId,
          label: command.label?.trim() || "Child",
        });
        const result = await createFamilyTreeRelationshipWithScaffold({
          userId,
          fromNodeId: command.personId,
          toNodeId: created.node.id,
          type: "parent_of",
          scaffold: false,
          linkSpousesAsCoParents: false,
          linkCoParentsAsSpouses: false,
        });
        return snapshot(
          userId,
          [...created.notices, ...result.notices],
          result.scaffold,
          created.node.id,
        );
      }

      const created = await createFamilyTreeNode({
        userId,
        label: command.label?.trim() || "Child",
        link: {
          type: "parent_of",
          otherNodeId: command.personId,
          newNodeIs: "to",
        },
      });
      return snapshot(userId, created.notices, null, created.node.id);
    }

    case "addSibling": {
      if (command.siblingNodeId) {
        const result = await createFamilyTreeRelationshipWithScaffold({
          userId,
          fromNodeId: command.personId,
          toNodeId: command.siblingNodeId,
          type: "sibling_of",
          scaffold: false,
        });
        return snapshot(
          userId,
          result.notices,
          result.scaffold,
          command.siblingNodeId,
        );
      }
      const created = await createFamilyTreeNode({
        userId,
        label: command.label?.trim() || "Sibling",
        link: {
          type: "sibling_of",
          otherNodeId: command.personId,
          newNodeIs: "from",
        },
      });
      return snapshot(userId, created.notices, null, created.node.id);
    }

    case "addCousin": {
      const tree = await getFamilyTreeGraph(userId);
      const person = tree.nodes.find((n) => n.id === command.personId);
      const parents = parentIdsOf(tree, command.personId);
      if (shouldAskCousinSide(parents, command.side)) {
        return {
          ok: false,
          needsInput: {
            kind: "cousinSide",
            message: cousinSidePromptMessage(
              person?.label ?? "this relative",
            ),
            personId: command.personId,
          },
          tree,
          notices: [],
          scaffold: null,
        };
      }

      if (command.cousinNodeId) {
        const result = await createFamilyTreeRelationshipWithScaffold({
          userId,
          fromNodeId: command.personId,
          toNodeId: command.cousinNodeId,
          type: "cousin_of",
          cousinSide: command.side ?? "unknown",
        });
        return snapshot(
          userId,
          result.notices,
          result.scaffold,
          command.cousinNodeId,
        );
      }

      const created = await createFamilyTreeNode({
        userId,
        label: command.label?.trim() || "Cousin",
      });
      const result = await createFamilyTreeRelationshipWithScaffold({
        userId,
        fromNodeId: command.personId,
        toNodeId: created.node.id,
        type: "cousin_of",
        cousinSide: command.side ?? "unknown",
      });
      return snapshot(
        userId,
        [...created.notices, ...result.notices],
        result.scaffold,
        created.node.id,
      );
    }

    case "connect": {
      if (command.relationType === "cousin_of") {
        const tree = await getFamilyTreeGraph(userId);
        const fromParents = parentIdsOf(tree, command.fromNodeId);
        const toParents = parentIdsOf(tree, command.toNodeId);
        // Ask about the endpoint that already has two parents (clear sides).
        const askAbout =
          shouldAskCousinSide(fromParents, command.cousinSide)
            ? command.fromNodeId
            : shouldAskCousinSide(toParents, command.cousinSide)
              ? command.toNodeId
              : null;
        if (askAbout) {
          const person = tree.nodes.find((n) => n.id === askAbout);
          return {
            ok: false,
            needsInput: {
              kind: "cousinSide",
              message: cousinSidePromptMessage(
                person?.label ?? "this relative",
              ),
              personId: askAbout,
            },
            tree,
            notices: [],
            scaffold: null,
          };
        }
      }

      const result = await createFamilyTreeRelationshipWithScaffold({
        userId,
        fromNodeId: command.fromNodeId,
        toNodeId: command.toNodeId,
        type: command.relationType,
        cousinSide: command.cousinSide,
        linkSpousesAsCoParents:
          command.relationType === "parent_of"
            ? !command.oneParentOnly
            : undefined,
      });
      return snapshot(userId, result.notices, result.scaffold);
    }

    case "repairTree": {
      const { getDb } = await import("@/lib/db");
      const { familyTreeNodes, familyTreeRelationships } = await import(
        "@/lib/db/schema"
      );
      const { asc, eq } = await import("drizzle-orm");
      const { runFamilyTreeRepairPass } = await import(
        "@/lib/family-tree/repair-apply"
      );
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
      const repaired = await runFamilyTreeRepairPass(
        userId,
        rawNodes,
        rawRelationships,
        { dryRun: command.dryRun === true },
      );
      const tree = await getFamilyTreeGraph(userId, {
        skipRepair: command.dryRun === true,
      });
      const notices = repaired.result.message
        ? [
            {
              kind: "spouse_link" as const,
              message: repaired.result.message,
            },
          ]
        : [];
      return {
        ok: true,
        tree: { ...tree, repair: repaired.result },
        notices,
        scaffold: null,
      };
    }

    default: {
      const _exhaustive: never = command;
      void _exhaustive;
      throw new FamilyTreeError("Unknown genealogy command.", {
        code: "validation",
      });
    }
  }
}

/** @internal test helper — expose empty scaffold shape */
export const __test = { emptyScaffold };
