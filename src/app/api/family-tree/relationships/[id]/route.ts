import { NextResponse } from "next/server";
import {
  deleteFamilyTreeRelationship,
  getFamilyTreeGraph,
} from "@/lib/family-tree";
import {
  familyTreeApiErrorResponse,
  requireFamilyTreeEditAccess,
} from "@/lib/family-tree/http";
import { serializeFamilyTreeGraph } from "@/lib/family-tree/serialize";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/family-tree/relationships/[id]
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const authResult = await requireFamilyTreeEditAccess();
  if (!authResult.ok) return authResult.response;

  try {
    const { id } = await context.params;
    await deleteFamilyTreeRelationship(authResult.treeOwnerId, id);
    const graph = await getFamilyTreeGraph(authResult.treeOwnerId);
    return NextResponse.json({
      ok: true,
      tree: serializeFamilyTreeGraph(graph),
    });
  } catch (error) {
    return familyTreeApiErrorResponse(error, "Failed to remove relationship");
  }
}
