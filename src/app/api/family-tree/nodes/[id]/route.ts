import { NextResponse } from "next/server";
import { z } from "zod";
import { runGenealogyCommand } from "@/lib/family-tree/engine";
import {
  familyIdFromRequestUrl,
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
 * Delegates to the Genealogy Relationship Engine.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const authResult = await requireFamilyTreeEditAccess(
    familyIdFromRequestUrl(request),
  );
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

    const scope = authResult.scope;
    let tree = null;

    if (parsed.data.label !== undefined || parsed.data.notes !== undefined) {
      const result = await runGenealogyCommand(scope, {
        type: "renameNode",
        nodeId: id,
        label: parsed.data.label,
        notes: parsed.data.notes,
      });
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, needsInput: result.needsInput },
          { status: 409 },
        );
      }
      tree = result.tree;
    }

    if (parsed.data.personId !== undefined) {
      const result = await runGenealogyCommand(scope, {
        type: "linkPlaceholderToPerson",
        nodeId: id,
        peopleId: parsed.data.personId,
      });
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, needsInput: result.needsInput },
          { status: 409 },
        );
      }
      tree = result.tree;
    }

    if (!tree) {
      return NextResponse.json(
        { error: "No genealogy updates provided." },
        { status: 400 },
      );
    }

    const node = tree.nodes.find((n) => n.id === id);
    if (!node) {
      return NextResponse.json({ error: "Tree member not found." }, { status: 404 });
    }

    return NextResponse.json({
      node: serializeFamilyTreeNode(node),
      tree: serializeFamilyTreeGraph(tree),
    });
  } catch (error) {
    return familyTreeApiErrorResponse(error, "Failed to update tree member");
  }
}

/**
 * DELETE /api/family-tree/nodes/[id]
 */
export async function DELETE(request: Request, context: RouteContext) {
  const authResult = await requireFamilyTreeEditAccess(
    familyIdFromRequestUrl(request),
  );
  if (!authResult.ok) return authResult.response;

  try {
    const { id } = await context.params;
    const result = await runGenealogyCommand(authResult.scope, {
      type: "deleteNode",
      nodeId: id,
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
    return familyTreeApiErrorResponse(error, "Failed to remove tree member");
  }
}
