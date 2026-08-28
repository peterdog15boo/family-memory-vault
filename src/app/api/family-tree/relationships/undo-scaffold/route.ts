import { NextResponse } from "next/server";
import { z } from "zod";
import { runGenealogyCommand } from "@/lib/family-tree/engine";
import {
  familyIdFromRequestUrl,
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
 * Delegates to the Genealogy Relationship Engine.
 */
export async function POST(request: Request) {
  const authResult = await requireFamilyTreeEditAccess(
    familyIdFromRequestUrl(request),
  );
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

    const result = await runGenealogyCommand(authResult.scope, {
      type: "undoScaffold",
      nodeIds: parsed.data.nodeIds,
      relationshipIds: parsed.data.relationshipIds,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, needsInput: result.needsInput },
        { status: 409 },
      );
    }

    return NextResponse.json({ tree: serializeFamilyTreeGraph(result.tree) });
  } catch (error) {
    return familyTreeApiErrorResponse(error, "Failed to undo tree changes");
  }
}
