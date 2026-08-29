import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { families } from "@/lib/db/schema";
import { setFamilyTreeSharing } from "@/lib/family-tree/access";
import {
  familyApiErrorResponse,
  requireFamilyApiOwner,
  requireFamilyApiUser,
} from "@/lib/families/http";
import { serializeFamily } from "@/lib/families/serialize";
import { canUseFamilyTree } from "@/lib/plans/gates";
import { ensureAppUser } from "@/lib/users";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  shared: z.boolean(),
  membersCanEdit: z.boolean().optional(),
});

/**
 * PATCH /api/family/[id]/tree-sharing — creator toggles share + membersCanEdit.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const authResult = await requireFamilyApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const { id: familyId } = await context.params;
  if (!familyId?.trim()) {
    return NextResponse.json({ error: "Missing family id" }, { status: 400 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid sharing payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await ensureAppUser(userId);
    await requireFamilyApiOwner(familyId, userId);

    const db = getDb();
    const [family] = await db
      .select()
      .from(families)
      .where(eq(families.id, familyId))
      .limit(1);
    if (!family) {
      return NextResponse.json({ error: "Family not found" }, { status: 404 });
    }

    if (family.createdByUserId !== userId) {
      return NextResponse.json(
        { error: "Only the family creator can share their Family Tree." },
        { status: 403 },
      );
    }

    const gate = await canUseFamilyTree(userId);
    if (!gate.allowed) {
      return NextResponse.json(
        { error: gate.reason ?? "Family Tree is not on your plan." },
        { status: 403 },
      );
    }

    await setFamilyTreeSharing({
      familyId,
      shared: parsed.data.shared,
      membersCanEdit: parsed.data.membersCanEdit,
    });

    const [updated] = await db
      .select()
      .from(families)
      .where(eq(families.id, familyId))
      .limit(1);

    return NextResponse.json({
      family: updated ? serializeFamily(updated) : null,
    });
  } catch (error) {
    return familyApiErrorResponse(error, "Failed to update Family Tree sharing");
  }
}
