import { NextResponse } from "next/server";
import { z } from "zod";
import { createFamilyTreeNode, getFamilyTreeGraph } from "@/lib/family-tree";
import {
  familyTreeApiErrorResponse,
  requireFamilyTreeEditAccess,
} from "@/lib/family-tree/http";
import {
  serializeFamilyTreeGraph,
  serializeFamilyTreeNode,
} from "@/lib/family-tree/serialize";

import { FAMILY_TREE_RELATION_TYPES } from "@/lib/db/schema";

const createBodySchema = z.object({
  label: z.string().trim().min(1).max(120),
  personId: z.string().trim().min(1).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  /** Atomically create a relationship with this new node. */
  link: z
    .object({
      type: z.enum(FAMILY_TREE_RELATION_TYPES),
      otherNodeId: z.string().trim().min(1),
      newNodeIs: z.enum(["from", "to"]),
    })
    .optional(),
});

/**
 * POST /api/family-tree/nodes — add a placeholder or place a Person on the tree.
 */
export async function POST(request: Request) {
  const authResult = await requireFamilyTreeEditAccess();
  if (!authResult.ok) return authResult.response;

  try {
    const json = await request.json().catch(() => null);
    const parsed = createBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid tree member payload.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const treeOwnerId = authResult.treeOwnerId;
    const node = await createFamilyTreeNode({
      userId: treeOwnerId,
      label: parsed.data.label,
      personId: parsed.data.personId ?? null,
      notes: parsed.data.notes ?? null,
      link: parsed.data.link,
    });

    const graph = await getFamilyTreeGraph(treeOwnerId);
    const enriched = graph.nodes.find((n) => n.id === node.id);

    return NextResponse.json(
      {
        node: enriched
          ? serializeFamilyTreeNode(enriched)
          : {
              ...node,
              isPlaceholder: !node.personId,
              person: null,
              generation: 0,
              createdAt: node.createdAt.toISOString(),
              updatedAt: node.updatedAt.toISOString(),
            },
        tree: serializeFamilyTreeGraph(graph),
      },
      { status: 201 },
    );
  } catch (error) {
    return familyTreeApiErrorResponse(error, "Failed to add tree member");
  }
}
