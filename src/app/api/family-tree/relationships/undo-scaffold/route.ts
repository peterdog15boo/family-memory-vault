import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getFamilyTreeGraph,
  undoFamilyTreeScaffold,
} from "@/lib/family-tree";
import {
  familyTreeApiErrorResponse,
  requireFamilyTreeEditAccess,
} from "@/lib/family-tree/http";
import { serializeFamilyTreeGraph } from "@/lib/family-tree/serialize";

const undoBodySchema = z.object({
  nodeIds: z.array(z.string().trim().min(1)).default([]),
  relationshipIds: z.array(z.string().trim().min(1)).default([]),
});

/**
 * POST /api/family-tree/relationships/undo-scaffold
 * Undo auto-created placeholders + the relationship that triggered them.
 */
export async function POST(request: Request) {
  const authResult = await requireFamilyTreeEditAccess();
  if (!authResult.ok) return authResult.response;

  try {
    const json = await request.json().catch(() => null);
    const parsed = undoBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid undo payload.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    await undoFamilyTreeScaffold({
      userId: authResult.treeOwnerId,
      nodeIds: parsed.data.nodeIds,
      relationshipIds: parsed.data.relationshipIds,
    });

    const graph = await getFamilyTreeGraph(authResult.treeOwnerId);
    return NextResponse.json({ tree: serializeFamilyTreeGraph(graph) });
  } catch (error) {
    return familyTreeApiErrorResponse(error, "Failed to undo tree changes");
  }
}
