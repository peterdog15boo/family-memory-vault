import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createFamilyTreeRelationshipWithScaffold,
  getFamilyTreeGraph,
} from "@/lib/family-tree";
import {
  familyTreeApiErrorResponse,
  requireFamilyTreeEditAccess,
} from "@/lib/family-tree/http";
import {
  serializeFamilyTreeGraph,
  serializeFamilyTreeRelationship,
} from "@/lib/family-tree/serialize";
import { FAMILY_TREE_RELATION_TYPES } from "@/lib/db/schema";

const createBodySchema = z.object({
  fromNodeId: z.string().trim().min(1),
  toNodeId: z.string().trim().min(1),
  type: z.enum(FAMILY_TREE_RELATION_TYPES),
  /** Default true — auto-add minimum placeholders for extended relations. */
  scaffold: z.boolean().optional(),
});

/**
 * POST /api/family-tree/relationships — assign an explicit relationship type.
 * Extended relations may auto-create placeholder parents/partners for structure.
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

    const result = await createFamilyTreeRelationshipWithScaffold({
      userId: authResult.treeOwnerId,
      fromNodeId: parsed.data.fromNodeId,
      toNodeId: parsed.data.toNodeId,
      type: parsed.data.type,
      scaffold: parsed.data.scaffold,
    });
    const graph = await getFamilyTreeGraph(authResult.treeOwnerId);

    return NextResponse.json(
      {
        relationship: serializeFamilyTreeRelationship(result.relationship),
        tree: serializeFamilyTreeGraph(graph),
        notices: result.notices,
        scaffold:
          result.scaffold.message ||
          result.scaffold.createdNodeIds.length > 0
            ? {
                message: result.scaffold.message,
                createdNodeIds: result.scaffold.createdNodeIds,
                createdRelationshipIds: result.scaffold.createdRelationshipIds,
                undoNodeIds: result.scaffold.undoNodeIds,
                undoRelationshipIds: result.scaffold.undoRelationshipIds,
              }
            : null,
      },
      { status: 201 },
    );
  } catch (error) {
    return familyTreeApiErrorResponse(error, "Failed to add relationship");
  }
}
