import { NextResponse } from "next/server";
import { z } from "zod";
import {
  FAMILY_MEMBER_ROLES,
  removeMember,
  updateMemberRole,
} from "@/lib/families";
import {
  familyApiErrorResponse,
  requireFamilyApiOwner,
  requireFamilyApiUser,
} from "@/lib/families/http";
import { serializeFamilyMember } from "@/lib/families/serialize";
import { ensureAppUser } from "@/lib/users";

type RouteContext = {
  params: Promise<{ id: string; memberId: string }>;
};

const patchBodySchema = z.object({
  role: z.enum(FAMILY_MEMBER_ROLES),
});

/**
 * PATCH /api/family/[id]/members/[memberId] — change role (owner only).
 */
export async function PATCH(request: Request, context: RouteContext) {
  const authResult = await requireFamilyApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const { id: familyId, memberId } = await context.params;
  if (!familyId?.trim() || !memberId?.trim()) {
    return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid role update", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await ensureAppUser(userId);
    await requireFamilyApiOwner(familyId, userId);
    const member = await updateMemberRole(
      familyId,
      memberId,
      parsed.data.role,
      userId,
    );
    return NextResponse.json({ member: serializeFamilyMember(member) });
  } catch (error) {
    return familyApiErrorResponse(error, "Failed to update member role");
  }
}

/**
 * DELETE /api/family/[id]/members/[memberId] — remove member / cancel invite (owner only).
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const authResult = await requireFamilyApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const { id: familyId, memberId } = await context.params;
  if (!familyId?.trim() || !memberId?.trim()) {
    return NextResponse.json({ error: "Missing ids" }, { status: 400 });
  }

  try {
    await ensureAppUser(userId);
    await requireFamilyApiOwner(familyId, userId);
    const member = await removeMember(familyId, memberId, userId);
    return NextResponse.json({ member: serializeFamilyMember(member) });
  } catch (error) {
    return familyApiErrorResponse(error, "Failed to remove family member");
  }
}
