import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ensureFamilyTree,
  resolveFamilyTreeAccess,
} from "@/lib/family-tree/access";
import { familyTreeApiErrorResponse } from "@/lib/family-tree/http";
import { requireApiUser } from "@/lib/auth/api";
import { canUseFamilyTree } from "@/lib/plans/gates";
import { planGateDeniedResponse } from "@/lib/auth/plan-api";
import { apiError } from "@/lib/http/api-error";

const bodySchema = z.object({
  familyId: z.string().trim().min(1),
});

/**
 * POST /api/family-tree/ensure — create the family's tree registry row (idempotent).
 * Family creator only; requires Family Tree on the creator's plan.
 */
export async function POST(request: Request) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;

  try {
    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return apiError("familyId is required.", { status: 400, code: "validation" });
    }

    const access = await resolveFamilyTreeAccess(
      authResult.userId,
      parsed.data.familyId,
    );
    if (!access || access.familyId !== parsed.data.familyId) {
      return apiError("You do not have access to this family.", {
        status: 403,
        code: "forbidden",
      });
    }
    if (!access.isOwner) {
      return apiError("Only the family creator can create this tree.", {
        status: 403,
        code: "forbidden",
      });
    }

    const gate = await canUseFamilyTree(access.peopleOwnerId);
    if (!gate.allowed) {
      return planGateDeniedResponse(gate);
    }

    await ensureFamilyTree({
      familyId: access.familyId,
      createdByUserId: access.peopleOwnerId,
    });

    return NextResponse.json({
      ok: true,
      familyId: access.familyId,
      familyName: access.familyName,
    });
  } catch (error) {
    return familyTreeApiErrorResponse(error, "Failed to create family tree");
  }
}
