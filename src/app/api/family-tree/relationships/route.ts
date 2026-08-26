import { NextResponse } from "next/server";
import { z } from "zod";
import { runGenealogyCommand } from "@/lib/family-tree/engine";
import {
  familyTreeApiErrorResponse,
  requireFamilyTreeEditAccess,
} from "@/lib/family-tree/http";
import {
  serializeFamilyTreeGraph,
} from "@/lib/family-tree/serialize";
import { FAMILY_TREE_RELATION_TYPES } from "@/lib/db/schema";

const createBodySchema = z.object({
  fromNodeId: z.string().trim().min(1),
  toNodeId: z.string().trim().min(1),
  type: z.enum(FAMILY_TREE_RELATION_TYPES),
  /** Default true — auto-add minimum placeholders for extended relations. */
  scaffold: z.boolean().optional(),
  cousinSide: z.enum(["maternal", "paternal", "unknown"]).optional(),
  oneParentOnly: z.boolean().optional(),
});

/**
 * POST /api/family-tree/relationships
 * Legacy entry — delegates to the Genealogy Relationship Engine (`connect`).
 * Prefer POST /api/family-tree/commands.
 */
export async function POST(request: Request) {
  const authResult = await requireFamilyTreeEditAccess();
  if (!authResult.ok) return authResult.response;

  try {
    const json = await request.json().catch(() => null);
    const parsed = createBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid relationship payload.",
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const result = await runGenealogyCommand(authResult.treeOwnerId, {
      type: "connect",
      fromNodeId: parsed.data.fromNodeId,
      toNodeId: parsed.data.toNodeId,
      relationType: parsed.data.type,
      cousinSide: parsed.data.cousinSide,
      oneParentOnly: parsed.data.oneParentOnly,
    });

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

    return NextResponse.json(
      {
        tree: serializeFamilyTreeGraph(result.tree),
        notices: result.notices,
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
      },
      { status: 201 },
    );
  } catch (error) {
    return familyTreeApiErrorResponse(error, "Failed to add relationship");
  }
}
