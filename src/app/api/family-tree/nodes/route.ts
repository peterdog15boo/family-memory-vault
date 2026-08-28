import { NextResponse } from "next/server";
import { z } from "zod";
import {
  runGenealogyCommand,
  type GenealogyEngineCommand,
} from "@/lib/family-tree/engine";
import {
  familyIdFromRequestUrl,
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

function commandForCreate(input: z.infer<typeof createBodySchema>): GenealogyEngineCommand {
  const { label, personId, link } = input;

  if (!link) {
    if (personId) {
      return { type: "placePerson", peopleId: personId, label };
    }
    return { type: "addPlaceholder", label };
  }

  const { type, otherNodeId, newNodeIs } = link;

  if (type === "partner_of") {
    return { type: "addSpouse", personId: otherNodeId, label };
  }
  if (type === "parent_of" && newNodeIs === "from") {
    return { type: "addParent", personId: otherNodeId, label };
  }
  if (type === "parent_of" && newNodeIs === "to") {
    return { type: "addChild", personId: otherNodeId, label };
  }
  if (type === "sibling_of") {
    return { type: "addSibling", personId: otherNodeId, label };
  }
  if (type === "cousin_of") {
    return { type: "addCousin", personId: otherNodeId, label };
  }

  // Extended: placeholder first; caller runs a second connect command.
  if (personId) {
    return { type: "placePerson", peopleId: personId, label };
  }
  return { type: "addPlaceholder", label };
}

/**
 * POST /api/family-tree/nodes
 * Legacy entry — delegates to the Genealogy Relationship Engine.
 * Prefer POST /api/family-tree/commands.
 */
export async function POST(request: Request) {
  const authResult = await requireFamilyTreeEditAccess(
    familyIdFromRequestUrl(request),
  );
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

    const scope = authResult.scope;
    const link = parsed.data.link;
    const isExtendedLink =
      link &&
      !(
        link.type === "partner_of" ||
        link.type === "parent_of" ||
        link.type === "sibling_of" ||
        link.type === "cousin_of"
      );

    let result = await runGenealogyCommand(scope,
      commandForCreate(parsed.data),
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          needsInput: result.needsInput,
          tree: serializeFamilyTreeGraph(result.tree),
          notices: [],
        },
        { status: 409 },
      );
    }

    if (isExtendedLink && link && result.focusNodeId) {
      const newId = result.focusNodeId;
      result = await runGenealogyCommand(scope, {
        type: "connect",
        fromNodeId: link.newNodeIs === "from" ? newId : link.otherNodeId,
        toNodeId: link.newNodeIs === "to" ? newId : link.otherNodeId,
        relationType: link.type,
      });
      if (!result.ok) {
        return NextResponse.json(
          {
            ok: false,
            needsInput: result.needsInput,
            tree: serializeFamilyTreeGraph(result.tree),
            notices: [],
          },
          { status: 409 },
        );
      }
    }

    const graph = result.tree;
    const focusId = result.focusNodeId;
    const enriched = focusId
      ? graph.nodes.find((n) => n.id === focusId)
      : undefined;

    return NextResponse.json(
      {
        node: enriched ? serializeFamilyTreeNode(enriched) : null,
        tree: serializeFamilyTreeGraph(graph),
        notices: result.notices,
        focusNodeId: focusId ?? null,
      },
      { status: 201 },
    );
  } catch (error) {
    return familyTreeApiErrorResponse(error, "Failed to add tree member");
  }
}
