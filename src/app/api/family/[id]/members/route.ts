import { NextResponse } from "next/server";
import {
  getFamilyMembersWithProfiles,
  requireActiveFamilyMember,
} from "@/lib/families";
import {
  familyApiErrorResponse,
  requireFamilyApiUser,
} from "@/lib/families/http";
import { serializeFamilyMemberForViewer } from "@/lib/families/serialize";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/family/[id]/members — pending + active members.
 * Requires active membership. Pending invite emails are redacted for non-owners.
 */
export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireFamilyApiUser();
  if (!authResult.ok) return authResult.response;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing family id" }, { status: 400 });
  }

  try {
    const membership = await requireActiveFamilyMember(id, authResult.userId);
    const viewerIsOwner = membership.role === "owner";
    const members = await getFamilyMembersWithProfiles(id);
    return NextResponse.json({
      members: members.map((member) =>
        serializeFamilyMemberForViewer(member, { viewerIsOwner }),
      ),
    });
  } catch (error) {
    return familyApiErrorResponse(error, "Failed to list family members");
  }
}
