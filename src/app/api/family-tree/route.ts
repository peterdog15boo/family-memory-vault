import { NextResponse } from "next/server";
import {
  getFamilyTreeGraph,
  listPeopleAvailableForTree,
} from "@/lib/family-tree";
import {
  familyIdFromRequestUrl,
  familyTreeApiErrorResponse,
  requireFamilyTreeMembershipAccess,
} from "@/lib/family-tree/http";
import { serializeFamilyTreeGraph } from "@/lib/family-tree/serialize";
import { countUserPeople } from "@/lib/plans/gates";
import { listPeopleWithCovers } from "@/lib/people/queries";

/**
 * GET /api/family-tree — family-scoped graph (optional ?familyId=).
 * Members of a family with share off still get 200 + canView:false (no nodes).
 */
export async function GET(request: Request) {
  const authResult = await requireFamilyTreeMembershipAccess(
    familyIdFromRequestUrl(request),
  );
  if (!authResult.ok) return authResult.response;

  try {
    const { scope, access } = authResult;
    const peopleOwnerId = access.peopleOwnerId;
    const loadGraph = access.hasTree && access.canView;

    const [peopleCount, graph, availablePeople, peopleWithCovers] =
      await Promise.all([
        countUserPeople(peopleOwnerId),
        loadGraph ? getFamilyTreeGraph(scope) : Promise.resolve(null),
        loadGraph && access.canEdit
          ? listPeopleAvailableForTree(scope)
          : Promise.resolve([]),
        listPeopleWithCovers(peopleOwnerId),
      ]);

    const peopleCovers = peopleWithCovers.map((p) => ({
      personId: p.id,
      previewUrl: p.cover?.media.previewUrl ?? null,
      boundingBox: p.cover?.boundingBox ?? null,
      framing: {
        avatarFocusX: p.avatarFocusX,
        avatarFocusY: p.avatarFocusY,
        avatarZoom: p.avatarZoom,
      },
    }));

    return NextResponse.json({
      tree: graph ? serializeFamilyTreeGraph(graph) : null,
      availablePeople,
      peopleCovers,
      peopleCount,
      access: {
        treeOwnerId: access.peopleOwnerId,
        canView: access.canView,
        canEdit: access.canEdit,
        isOwner: access.isOwner,
        familyId: access.familyId,
        familyName: access.familyName,
        hasTree: access.hasTree,
        treeSharedWithFamily: access.treeSharedWithFamily,
        shareWithMembers: access.shareWithMembers,
        membersCanEdit: access.membersCanEdit,
      },
    });
  } catch (error) {
    return familyTreeApiErrorResponse(error, "Failed to load family tree");
  }
}
