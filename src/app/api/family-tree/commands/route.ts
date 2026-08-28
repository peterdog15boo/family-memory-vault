import { NextResponse } from "next/server";
import { z } from "zod";
import {
  runGenealogyCommand,
  type GenealogyEngineCommand,
} from "@/lib/family-tree/engine";
import { COUSIN_SIDES } from "@/lib/family-tree/cousin-side";
import {
  familyTreeApiErrorResponse,
  requireFamilyTreeEditAccess,
} from "@/lib/family-tree/http";
import { serializeFamilyTreeGraph } from "@/lib/family-tree/serialize";
import { FAMILY_TREE_RELATION_TYPES } from "@/lib/db/schema";

const cousinSideSchema = z.enum(COUSIN_SIDES);

const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("addSpouse"),
    personId: z.string().trim().min(1),
    spouseNodeId: z.string().trim().min(1).optional(),
    label: z.string().trim().min(1).max(120).optional(),
    excludeChildIds: z.array(z.string().trim().min(1)).optional(),
  }),
  z.object({
    type: z.literal("addParent"),
    personId: z.string().trim().min(1),
    parentNodeId: z.string().trim().min(1).optional(),
    label: z.string().trim().min(1).max(120).optional(),
  }),
  z.object({
    type: z.literal("addChild"),
    personId: z.string().trim().min(1),
    childNodeId: z.string().trim().min(1).optional(),
    label: z.string().trim().min(1).max(120).optional(),
    oneParentOnly: z.boolean().optional(),
    coParentSpouseIds: z.array(z.string().trim().min(1)).optional(),
  }),
  z.object({
    type: z.literal("addSibling"),
    personId: z.string().trim().min(1),
    siblingNodeId: z.string().trim().min(1).optional(),
    label: z.string().trim().min(1).max(120).optional(),
  }),
  z.object({
    type: z.literal("addCousin"),
    personId: z.string().trim().min(1),
    cousinNodeId: z.string().trim().min(1).optional(),
    label: z.string().trim().min(1).max(120).optional(),
    side: cousinSideSchema.optional(),
    parent1Label: z.string().trim().min(1).max(120).optional(),
    parent2Label: z.string().trim().min(1).max(120).optional(),
    cousinPeopleId: z.string().trim().min(1).nullable().optional(),
    attachWhich: z.enum(["parent1", "parent2", "unsure"]).optional(),
    attachToNodeId: z.string().trim().min(1).optional(),
  }),
  z.object({
    type: z.literal("connect"),
    fromNodeId: z.string().trim().min(1),
    toNodeId: z.string().trim().min(1),
    relationType: z.enum(FAMILY_TREE_RELATION_TYPES),
    cousinSide: cousinSideSchema.optional(),
    oneParentOnly: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("placePerson"),
    peopleId: z.string().trim().min(1),
    label: z.string().trim().min(1).max(120).optional(),
  }),
  z.object({
    type: z.literal("addPlaceholder"),
    label: z.string().trim().min(1).max(120),
  }),
  z.object({
    type: z.literal("linkPlaceholderToPerson"),
    nodeId: z.string().trim().min(1),
    peopleId: z.string().trim().min(1).nullable(),
  }),
  z.object({
    type: z.literal("clearNodeReview"),
    nodeId: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal("renameNode"),
    nodeId: z.string().trim().min(1),
    label: z.string().trim().min(1).max(120).optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  }),
  z.object({
    type: z.literal("removeRelationship"),
    edgeId: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal("deleteNode"),
    nodeId: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal("undoScaffold"),
    nodeIds: z.array(z.string().trim().min(1)),
    relationshipIds: z.array(z.string().trim().min(1)),
  }),
  z.object({
    type: z.literal("repairTree"),
    dryRun: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("correctLayout"),
  }),
]);

/**
 * POST /api/family-tree/commands — Genealogy Relationship Engine entrypoint.
 * All Family Tree graph edits should go through this route.
 */
export async function POST(request: Request) {
  const authResult = await requireFamilyTreeEditAccess();
  if (!authResult.ok) return authResult.response;

  try {
    const json = await request.json().catch(() => null);
    const parsed = commandSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid genealogy command.",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const result = await runGenealogyCommand(
      authResult.treeOwnerId,
      parsed.data as GenealogyEngineCommand,
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          needsInput: result.needsInput,
          tree: serializeFamilyTreeGraph(result.tree),
          notices: [],
          scaffold: null,
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      tree: serializeFamilyTreeGraph(result.tree),
      notices: result.notices,
      focusNodeId: result.focusNodeId ?? null,
      scaffold:
        result.scaffold?.message ||
        (result.scaffold?.createdNodeIds.length ?? 0) > 0
          ? {
              message: result.scaffold?.message ?? null,
              createdNodeIds: result.scaffold?.createdNodeIds ?? [],
              createdRelationshipIds:
                result.scaffold?.createdRelationshipIds ?? [],
              undoNodeIds: result.scaffold?.undoNodeIds ?? [],
              undoRelationshipIds:
                result.scaffold?.undoRelationshipIds ?? [],
            }
          : null,
    });
  } catch (error) {
    return familyTreeApiErrorResponse(error, "Genealogy command failed");
  }
}
