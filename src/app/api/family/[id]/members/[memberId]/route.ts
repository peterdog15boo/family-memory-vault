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
import { setMemberTreeAccess } from "@/lib/family-tree/access";
import { getDb } from "@/lib/db";
import { familyMembers } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { ensureAppUser } from "@/lib/users";

type RouteContext = {
  params: Promise<{ id: string; memberId: string }>;
};

const patchBodySchema = z
  .object({
    role: z.enum(FAMILY_MEMBER_ROLES).optional(),
    canViewTree: z.boolean().optional(),
    canContributeTree: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.role !== undefined ||
      v.canViewTree !== undefined ||
      v.canContributeTree !== undefined,
    { message: "Provide role and/or tree access fields." },
  );

/**
 * PATCH /api/family/[id]/members/[memberId] — role and/or tree access (owner only).
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
      { error: "Invalid member update", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await ensureAppUser(userId);
    await requireFamilyApiOwner(familyId, userId);

    if (parsed.data.role !== undefined) {
      await updateMemberRole(familyId, memberId, parsed.data.role, userId);
    }

    if (
      parsed.data.canViewTree !== undefined ||
      parsed.data.canContributeTree !== undefined
    ) {
      const db = getDb();
      const [existing] = await db
        .select()
        .from(familyMembers)
        .where(
          and(
            eq(familyMembers.id, memberId),
            eq(familyMembers.familyId, familyId),
          ),
        )
        .limit(1);
      if (!existing) {
        return NextResponse.json({ error: "Member not found" }, { status: 404 });
      }

      await setMemberTreeAccess({
        familyId,
        memberId,
        canViewTree:
          parsed.data.canViewTree ?? existing.canViewTree,
        canContributeTree:
          parsed.data.canContributeTree ?? existing.canContributeTree,
      });
    }

    const db = getDb();
    const [member] = await db
      .select()
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.id, memberId),
          eq(familyMembers.familyId, familyId),
        ),
      )
      .limit(1);

    return NextResponse.json({
      member: member ? serializeFamilyMember(member) : null,
    });
  } catch (error) {
    return familyApiErrorResponse(error, "Failed to update family member");
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
