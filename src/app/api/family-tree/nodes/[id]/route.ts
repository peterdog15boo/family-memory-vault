import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteFamilyTreeNode,
  getFamilyTreeGraph,
  updateFamilyTreeNode,
} from "@/lib/family-tree";
import {
  familyTreeApiErrorResponse,
  requireFamilyTreeEditAccess,
} from "@/lib/family-tree/http";
import {
  serializeFamilyTreeGraph,
  serializeFamilyTreeNode,
} from "@/lib/family-tree/serialize";

type RouteContext = { params: Promise<{ id: string }> };

const patchBodySchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  personId: z.string().trim().min(1).nullable().optional(),
});

/**
 * PATCH /api/family-tree/nodes/[id] — rename, link/unlink Person.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const authResult = await requireFamilyTreeEditAccess();
  if (!authResult.ok) return authResult.response;

  try {
    const { id } = await context.params;
    const json = await request.json().catch(() => null);
    const parsed = patchBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid update payload.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    await updateFamilyTreeNode({
      userId: authResult.treeOwnerId,
      nodeId: id,
      ...parsed.data,
    });

    const graph = await getFamilyTreeGraph(authResult.treeOwnerId);
    const node = graph.nodes.find((n) => n.id === id);
    if (!node) {
      return NextResponse.json({ error: "Tree member not found." }, { status: 404 });
    }

    return NextResponse.json({
      node: serializeFamilyTreeNode(node),
      tree: serializeFamilyTreeGraph(graph),
    });
  } catch (error) {
    return familyTreeApiErrorResponse(error, "Failed to update tree member");
  }
}

/**
 * DELETE /api/family-tree/nodes/[id]
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const authResult = await requireFamilyTreeEditAccess();
  if (!authResult.ok) return authResult.response;

  try {
    const { id } = await context.params;
    await deleteFamilyTreeNode(authResult.treeOwnerId, id);
    const graph = await getFamilyTreeGraph(authResult.treeOwnerId);
    return NextResponse.json({
      ok: true,
      tree: serializeFamilyTreeGraph(graph),
    });
  } catch (error) {
    return familyTreeApiErrorResponse(error, "Failed to remove tree member");
  }
}
