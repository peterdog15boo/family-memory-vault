import { NextResponse } from "next/server";
import { requireFamilyApiMember, requireFamilyApiUser, familyApiErrorResponse } from "@/lib/families/http";
import { getFamilyMemberLocations } from "@/lib/location";
import { ensureAppUser } from "@/lib/users";

export const runtime = "nodejs";

/**
 * GET /api/family/[id]/locations
 * Active family members who opted in to location sharing.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireFamilyApiUser();
  if (!authResult.ok) return authResult.response;

  const { id: familyId } = await context.params;

  try {
    await ensureAppUser(authResult.userId);
    await requireFamilyApiMember(familyId, authResult.userId);

    const payload = await getFamilyMemberLocations(
      familyId,
      authResult.userId,
    );

    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    return familyApiErrorResponse(error, "Failed to load family locations");
  }
}
