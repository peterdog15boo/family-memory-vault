import { NextResponse } from "next/server";
import { z } from "zod";
import { logAdminAudit } from "@/lib/admin/audit";
import { requireAdminApi } from "@/lib/auth/admin";
import { getDb } from "@/lib/db";
import { families } from "@/lib/db/schema";
import {
  buildFamilyTreeDebugExport,
  familyTreeDebugFilename,
} from "@/lib/family-tree/debug-export";
import { FamilyTreeError } from "@/lib/family-tree";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

const querySchema = z
  .object({
    familyId: z.string().trim().min(1).optional(),
    peopleOwnerId: z.string().trim().min(1).optional(),
    /** @deprecated Prefer peopleOwnerId / familyId. */
    userId: z.string().trim().min(1).optional(),
    skipRepair: z
      .enum(["0", "1", "true", "false"])
      .optional()
      .transform((v) => v === undefined || v === "1" || v === "true"),
  })
  .refine((v) => Boolean(v.familyId || v.peopleOwnerId || v.userId), {
    message: "familyId or peopleOwnerId/userId is required",
  });

/**
 * GET /api/admin/family-tree/export?familyId=… (or peopleOwnerId / userId)
 * Admin download of one family tree graph for layout debugging.
 */
export async function GET(request: Request) {
  const authResult = await requireAdminApi();
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    familyId: url.searchParams.get("familyId") ?? undefined,
    peopleOwnerId: url.searchParams.get("peopleOwnerId") ?? undefined,
    userId: url.searchParams.get("userId") ?? undefined,
    skipRepair: url.searchParams.get("skipRepair") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "familyId or peopleOwnerId/userId query param is required" },
      { status: 400 },
    );
  }

  try {
    const db = getDb();
    let familyId = parsed.data.familyId?.trim() || "";
    let peopleOwnerId =
      parsed.data.peopleOwnerId?.trim() ||
      parsed.data.userId?.trim() ||
      "";

    if (familyId && !peopleOwnerId) {
      const [fam] = await db
        .select({ createdByUserId: families.createdByUserId })
        .from(families)
        .where(eq(families.id, familyId))
        .limit(1);
      if (!fam) {
        return NextResponse.json({ error: "Family not found" }, { status: 404 });
      }
      peopleOwnerId = fam.createdByUserId;
    }

    if (!familyId && peopleOwnerId) {
      const [fam] = await db
        .select({ id: families.id })
        .from(families)
        .where(eq(families.createdByUserId, peopleOwnerId))
        .limit(1);
      if (!fam) {
        return NextResponse.json(
          { error: "No family found for that people owner" },
          { status: 404 },
        );
      }
      familyId = fam.id;
    }

    const scope = { familyId, peopleOwnerId };
    const payload = await buildFamilyTreeDebugExport(scope, {
      skipRepair: parsed.data.skipRepair,
    });

    await logAdminAudit({
      actorId: authResult.userId,
      action: "family_tree.export_debug",
      targetType: "family",
      targetId: familyId,
      metadata: {
        peopleOwnerId,
        nodeCount: payload.meta.nodeCount,
        relationshipCount: payload.meta.relationshipCount,
        skipRepair: payload.meta.skipRepair,
      },
    });

    const body = `${JSON.stringify(payload, null, 2)}\n`;
    const filename = familyTreeDebugFilename(scope);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof FamilyTreeError) {
      return apiError(error.message, {
        status: error.code === "not_found" ? 404 : 400,
        code: error.code ?? "validation",
      });
    }
    return apiErrorFromUnknown(error, "Could not export family tree debug JSON.");
  }
}
