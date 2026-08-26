import { NextResponse } from "next/server";
import { runGenealogyCommand } from "@/lib/family-tree/engine";
import {
  familyTreeApiErrorResponse,
  requireFamilyTreeEditAccess,
} from "@/lib/family-tree/http";
import { serializeFamilyTreeGraph } from "@/lib/family-tree/serialize";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/family-tree/relationships/[id]
 * Delegates to the Genealogy Relationship Engine.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const authResult = await requireFamilyTreeEditAccess();
  if (!authResult.ok) return authResult.response;

  try {
    const { id } = await context.params;
    const result = await runGenealogyCommand(authResult.treeOwnerId, {
      type: "removeRelationship",
      edgeId: id,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, needsInput: result.needsInput },
        { status: 409 },
      );
    }
    return NextResponse.json({
      ok: true,
      tree: serializeFamilyTreeGraph(result.tree),
    });
  } catch (error) {
    return familyTreeApiErrorResponse(error, "Failed to remove relationship");
  }
}
