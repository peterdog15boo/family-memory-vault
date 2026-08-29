import { NextResponse } from "next/server";
import {
  getFamilyTreeGraph,
  listPeopleAvailableForTree,
} from "@/lib/family-tree";
import {
  familyIdFromRequestUrl,
  familyTreeApiErrorResponse,
  requireFamilyTreeViewAccess,
} from "@/lib/family-tree/http";
import { serializeFamilyTreeGraph } from "@/lib/family-tree/serialize";

/**
 * GET /api/family-tree — family-scoped graph (optional ?familyId=).
 */
export async function GET(request: Request) {
  const authResult = await requireFamilyTreeViewAccess(
    familyIdFromRequestUrl(request),
  );
  if (!authResult.ok) return authResult.response;

  try {
    const { scope, access } = authResult;
    const [graph, availablePeople] = await Promise.all([
      getFamilyTreeGraph(scope),
      access.canEdit
        ? listPeopleAvailableForTree(scope)
        : Promise.resolve([]),
    ]);
    return NextResponse.json({
      tree: serializeFamilyTreeGraph(graph),
      availablePeople,
      access: {
        treeOwnerId: access.peopleOwnerId,
        canView: access.canView,
        canEdit: access.canEdit,
        isOwner: access.isOwner,
        familyId: access.familyId,
        treeSharedWithFamily: access.treeSharedWithFamily,
        shareWithMembers: access.shareWithMembers,
        membersCanEdit: access.membersCanEdit,
      },
    });
  } catch (error) {
    return familyTreeApiErrorResponse(error, "Failed to load family tree");
  }
}
