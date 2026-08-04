import { NextResponse } from "next/server";
import { leaveFamily } from "@/lib/families";
import {
  familyApiErrorResponse,
  requireFamilyApiUser,
} from "@/lib/families/http";
import { serializeFamilyMember } from "@/lib/families/serialize";
import { ensureAppUser } from "@/lib/users";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * POST /api/family/[id]/leave — leave family (non-owners only).
 */
export async function POST(_request: Request, context: RouteContext) {
  const authResult = await requireFamilyApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const { id: familyId } = await context.params;
  if (!familyId?.trim()) {
    return NextResponse.json({ error: "Missing family id" }, { status: 400 });
  }

  try {
    await ensureAppUser(userId);
    const member = await leaveFamily(familyId, userId);
    return NextResponse.json({ member: serializeFamilyMember(member) });
  } catch (error) {
    return familyApiErrorResponse(error, "Failed to leave family");
  }
}
