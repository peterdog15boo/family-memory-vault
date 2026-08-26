import { NextResponse } from "next/server";
import {
  getFamilyTreeGraph,
  listPeopleAvailableForTree,
} from "@/lib/family-tree";
import {
  familyTreeApiErrorResponse,
  requireFamilyTreeViewAccess,
} from "@/lib/family-tree/http";
import { serializeFamilyTreeGraph } from "@/lib/family-tree/serialize";

/**
 * GET /api/family-tree — owner graph or shared family-owner tree.
 */
export async function GET() {
  const authResult = await requireFamilyTreeViewAccess();
  if (!authResult.ok) return authResult.response;

  try {
    const treeOwnerId = authResult.treeOwnerId;
    const [graph, availablePeople] = await Promise.all([
      getFamilyTreeGraph(treeOwnerId),
      authResult.access.canEdit
        ? listPeopleAvailableForTree(treeOwnerId)
        : Promise.resolve([]),
    ]);
    return NextResponse.json({
      tree: serializeFamilyTreeGraph(graph),
      availablePeople,
      access: {
        treeOwnerId,
        canView: authResult.access.canView,
        canEdit: authResult.access.canEdit,
        isOwner: authResult.access.isOwner,
        familyId: authResult.access.familyId,
        treeSharedWithFamily: authResult.access.treeSharedWithFamily,
      },
    });
  } catch (error) {
    return familyTreeApiErrorResponse(error, "Failed to load family tree");
  }
}
