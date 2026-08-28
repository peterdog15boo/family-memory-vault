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
import { createNamedCousinBranch } from "@/lib/family-tree/cousin-wizard";
import { listCousinAttachCandidates } from "@/lib/family-tree/cousin-attach";
import {
  cousinSidePromptMessage,
  shouldAskCousinSide,
  type CousinSide,
} from "@/lib/family-tree/cousin-side";
import { preferCousinSubjectId } from "@/lib/family-tree/cousin-lineage";
import { preferredExistingCoParentId } from "@/lib/family-tree/genealogy-iq";
import type { GenealogyIqNotice } from "@/lib/family-tree/genealogy-iq";
import { clearReviewFlag } from "@/lib/family-tree/repair";
import type { FamilyTreeRelationType } from "@/lib/db/schema";
import type { FamilyTreeScope } from "@/lib/family-tree/scope";

export type GenealogyEngineCommand =
  | {
      type: "addSpouse";
      personId: string;
      spouseNodeId?: string;
      label?: string;
      /**
       * Child node ids the new spouse should NOT become parent of
       * (“not this child’s parent”).
       */
      excludeChildIds?: string[];
      /** current (default) or former / divorced. */
      partnerStatus?: "current" | "former";
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
      /**
       * Spouses to also link as parents. Empty = none. Omit with
       * oneParentOnly false to link all spouses.
       */
      coParentSpouseIds?: string[];
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
      /** Existing cousin node (legacy connect-style). */
      cousinNodeId?: string;
      label?: string;
      side?: CousinSide;
      /** Wizard: required when creating a new cousin person. */
      parent1Label?: string;
      parent2Label?: string;
      cousinPeopleId?: string | null;
      attachWhich?: "parent1" | "parent2" | "unsure";
      /** Existing tree person the cousin’s parent siblings with. */
      attachToNodeId?: string;
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
  | { type: "correctLayout" }
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
  scope: FamilyTreeScope,
  notices: GenealogyIqNotice[] = [],
  scaffold: FamilyTreeRelationshipScaffoldResult["scaffold"] | null = null,
  focusNodeId?: string,
): Promise<GenealogyEngineResult> {
  const tree = await getFamilyTreeGraph(scope);
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
  scope: FamilyTreeScope,
  command: GenealogyEngineCommand,
): Promise<GenealogyEngineResponse> {
  switch (command.type) {
    case "addPlaceholder": {
      const created = await createFamilyTreeNode({
        scope,
        label: command.label,
      });
      return snapshot(scope, created.notices, null, created.node.id);
    }

    case "placePerson": {
      const created = await createFamilyTreeNode({
        scope,
        label: command.label?.trim() || "Person",
        personId: command.peopleId,
      });
      return snapshot(scope, created.notices, null, created.node.id);
    }

    case "renameNode": {
      if (command.label === undefined && command.notes === undefined) {
        throw new FamilyTreeError("Rename requires a label or notes.", {
          code: "validation",
        });
      }
      await updateFamilyTreeNode({
        scope,
        nodeId: command.nodeId,
        ...(command.label !== undefined ? { label: command.label } : {}),
        ...(command.notes !== undefined ? { notes: command.notes } : {}),
      });
      return snapshot(scope, [], null, command.nodeId);
    }

    case "linkPlaceholderToPerson": {
      await updateFamilyTreeNode({
        scope,
        nodeId: command.nodeId,
        personId: command.peopleId,
      });
      return snapshot(scope, [], null, command.nodeId);
    }

    case "clearNodeReview": {
      const tree = await getFamilyTreeGraph(scope, { skipRepair: true });
      const node = tree.nodes.find((n) => n.id === command.nodeId);
      if (!node) {
        throw new FamilyTreeError("Tree member not found.", {
          code: "not_found",
        });
      }
      await updateFamilyTreeNode({
        scope,
        nodeId: command.nodeId,
        notes: clearReviewFlag(node.notes),
      });
      return snapshot(scope, [], null, command.nodeId);
    }

    case "removeRelationship": {
      await deleteFamilyTreeRelationship(scope, command.edgeId);
      return snapshot(scope);
    }

    case "deleteNode": {
      await deleteFamilyTreeNode(scope, command.nodeId);
      return snapshot(scope);
    }

    case "undoScaffold": {
      await undoFamilyTreeScaffold({
        scope,
        nodeIds: command.nodeIds,
        relationshipIds: command.relationshipIds,
      });
      return snapshot(scope);
    }

    case "addSpouse": {
      if (command.spouseNodeId) {
        const result = await createFamilyTreeRelationshipWithScaffold({
          scope,
          fromNodeId: command.personId,
          toNodeId: command.spouseNodeId,
          type: "partner_of",
          scaffold: false,
          excludeChildIds: command.excludeChildIds,
          partnerStatus: command.partnerStatus ?? "current",
        });
        return snapshot(scope,
          result.notices,
          result.scaffold,
          command.spouseNodeId,
        );
      }
      const created = await createFamilyTreeNode({
        scope,
        label: command.label?.trim() || "Spouse",
        link: {
          type: "partner_of",
          otherNodeId: command.personId,
          newNodeIs: "from",
          excludeChildIds: command.excludeChildIds,
          partnerStatus: command.partnerStatus ?? "current",
        },
      });
      return snapshot(scope, created.notices, null, created.node.id);
    }

    case "addParent": {
      const tree = await getFamilyTreeGraph(scope);
      if (command.parentNodeId) {
        const result = await createFamilyTreeRelationshipWithScaffold({
          scope,
          fromNodeId: command.parentNodeId,
          toNodeId: command.personId,
          type: "parent_of",
          scaffold: false,
        });
        return snapshot(scope,
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
          scope,
          fromNodeId: existingSpouse,
          toNodeId: command.personId,
          type: "parent_of",
          scaffold: false,
        });
        return snapshot(scope,
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
        scope,
        label: command.label?.trim() || "Parent",
        link: {
          type: "parent_of",
          otherNodeId: command.personId,
          newNodeIs: "from",
        },
      });
      return snapshot(scope, created.notices, null, created.node.id);
    }

    case "addChild": {
      const coParentSpouseIds = command.coParentSpouseIds;
      const oneParentOnly =
        Boolean(command.oneParentOnly) ||
        (coParentSpouseIds !== undefined && coParentSpouseIds.length === 0);
      const linkSpousesAsCoParents = !oneParentOnly;

      if (command.childNodeId) {
        const result = await createFamilyTreeRelationshipWithScaffold({
          scope,
          fromNodeId: command.personId,
          toNodeId: command.childNodeId,
          type: "parent_of",
          scaffold: false,
          linkSpousesAsCoParents,
          coParentSpouseIds,
        });
        return snapshot(scope,
          result.notices,
          result.scaffold,
          command.childNodeId,
        );
      }

      if (oneParentOnly || coParentSpouseIds !== undefined) {
        const created = await createFamilyTreeNode({
          scope,
          label: command.label?.trim() || "Child",
        });
        const result = await createFamilyTreeRelationshipWithScaffold({
          scope,
          fromNodeId: command.personId,
          toNodeId: created.node.id,
          type: "parent_of",
          scaffold: false,
          linkSpousesAsCoParents,
          linkCoParentsAsSpouses: false,
          coParentSpouseIds,
        });
        return snapshot(scope,
          [...created.notices, ...result.notices],
          result.scaffold,
          created.node.id,
        );
      }

      const created = await createFamilyTreeNode({
        scope,
        label: command.label?.trim() || "Child",
        link: {
          type: "parent_of",
          otherNodeId: command.personId,
          newNodeIs: "to",
        },
      });
      return snapshot(scope, created.notices, null, created.node.id);
    }

    case "addSibling": {
      if (command.siblingNodeId) {
        const result = await createFamilyTreeRelationshipWithScaffold({
          scope,
          fromNodeId: command.personId,
          toNodeId: command.siblingNodeId,
          type: "sibling_of",
          scaffold: false,
        });
        return snapshot(scope,
          result.notices,
          result.scaffold,
          command.siblingNodeId,
        );
      }
      const created = await createFamilyTreeNode({
        scope,
        label: command.label?.trim() || "Sibling",
        link: {
          type: "sibling_of",
          otherNodeId: command.personId,
          newNodeIs: "from",
        },
      });
      return snapshot(scope, created.notices, null, created.node.id);
    }

    case "addCousin": {
      const tree = await getFamilyTreeGraph(scope);
      const person = tree.nodes.find((n) => n.id === command.personId);
      const parents = parentIdsOf(tree, command.personId);

      // Named-parent wizard path — never creates an unattached cousin.
      if (command.parent1Label?.trim() && !command.cousinNodeId) {
        const attachWhich = command.attachWhich ?? "unsure";
        let attachToNodeId = command.attachToNodeId?.trim() || "";
        if (!attachToNodeId) {
          const candidates = listCousinAttachCandidates(tree, command.personId);
          attachToNodeId = candidates[0]?.id ?? "";
        }
        if (!attachToNodeId) {
          return {
            ok: false,
            needsInput: {
              kind: "cousinSide",
              message:
                "Add parents for this person first, then add their cousin.",
              personId: command.personId,
            },
            tree,
            notices: [],
            scaffold: null,
          };
        }
        if (!command.label?.trim()) {
          throw new FamilyTreeError("Cousin name is required.", {
            code: "validation",
          });
        }
        const result = await createNamedCousinBranch({
          scope,
          subjectId: command.personId,
          cousinLabel: command.label,
          cousinPersonId: command.cousinPeopleId ?? null,
          parent1Label: command.parent1Label,
          parent2Label: command.parent2Label ?? null,
          attachWhich,
          attachToNodeId,
        });
        return snapshot(scope,
          [],
          {
            message: result.message,
            createdNodeIds: result.createdNodeIds,
            createdRelationshipIds: result.createdRelationshipIds,
            undoNodeIds: result.createdNodeIds,
            undoRelationshipIds: result.createdRelationshipIds,
          },
          result.cousinNodeId,
        );
      }

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
          scope,
          fromNodeId: command.personId,
          toNodeId: command.cousinNodeId,
          type: "cousin_of",
          cousinSide: command.side ?? "unknown",
          cousinSubjectId: command.personId,
        });
        return snapshot(scope,
          result.notices,
          result.scaffold,
          command.cousinNodeId,
        );
      }

      // Creating a new cousin without named parents is no longer allowed.
      throw new FamilyTreeError(
        "Use Add cousin and enter the cousin’s parents so they are not left unattached.",
        { code: "validation" },
      );
    }

    case "connect": {
      if (command.relationType === "cousin_of") {
        const tree = await getFamilyTreeGraph(scope);
        const lineageGraph = {
          nodes: tree.nodes.map((n) => ({ id: n.id, label: n.label })),
          relationships: tree.relationships.map((r) => ({
            fromNodeId: r.fromNodeId,
            toNodeId: r.toNodeId,
            type: r.type,
          })),
        };
        // Ask maternal/paternal about the bloodline subject (Kat), even when
        // the connect form listed the orphan cousin first.
        const subjectId = preferCousinSubjectId(
          lineageGraph,
          command.fromNodeId,
          command.toNodeId,
        );
        if (shouldAskCousinSide(parentIdsOf(tree, subjectId), command.cousinSide)) {
          const person = tree.nodes.find((n) => n.id === subjectId);
          return {
            ok: false,
            needsInput: {
              kind: "cousinSide",
              message: cousinSidePromptMessage(
                person?.label ?? "this relative",
              ),
              personId: subjectId,
            },
            tree,
            notices: [],
            scaffold: null,
          };
        }
      }

      const result = await createFamilyTreeRelationshipWithScaffold({
        scope,
        fromNodeId: command.fromNodeId,
        toNodeId: command.toNodeId,
        type: command.relationType,
        cousinSide: command.cousinSide,
        linkSpousesAsCoParents:
          command.relationType === "parent_of"
            ? !command.oneParentOnly
            : undefined,
      });
      return snapshot(scope, result.notices, result.scaffold);
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
          .where(eq(familyTreeNodes.familyId, scope.familyId))
          .orderBy(asc(familyTreeNodes.createdAt)),
        db
          .select()
          .from(familyTreeRelationships)
          .where(eq(familyTreeRelationships.familyId, scope.familyId))
          .orderBy(asc(familyTreeRelationships.createdAt)),
      ]);
      const repaired = await runFamilyTreeRepairPass(
        scope,
        rawNodes,
        rawRelationships,
        { dryRun: command.dryRun === true },
      );
      const tree = await getFamilyTreeGraph(scope, {
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

    case "correctLayout": {
      // Layout positions are derived client-side from the graph. Ensure
      // relationship repair has run, then return a fresh snapshot — the UI
      // reflows with Layout IQ and recenters the camera.
      const tree = await getFamilyTreeGraph(scope);
      return {
        ok: true,
        tree,
        notices: tree.repair?.message
          ? [
              {
                kind: "spouse_link" as const,
                message: tree.repair.message,
              },
            ]
          : [
              {
                kind: "spouse_link" as const,
                message:
                  "We updated your family tree layout so relatives sit in traditional positions.",
              },
            ],
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
