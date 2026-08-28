import { NextResponse } from "next/server";
import { z } from "zod";
import { logAdminAudit } from "@/lib/admin/audit";
import { requireAdminApi } from "@/lib/auth/admin";
import {
  buildFamilyTreeDebugExport,
  familyTreeDebugFilename,
} from "@/lib/family-tree/debug-export";
import { FamilyTreeError } from "@/lib/family-tree";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";

export const runtime = "nodejs";

const querySchema = z.object({
  userId: z.string().trim().min(1),
  skipRepair: z
    .enum(["0", "1", "true", "false"])
    .optional()
    .transform((v) => v === undefined || v === "1" || v === "true"),
});

/**
 * GET /api/admin/family-tree/export?userId=…
 * Admin download of one vault owner's tree graph for layout debugging.
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
    userId: url.searchParams.get("userId") ?? "",
    skipRepair: url.searchParams.get("skipRepair") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "userId query param is required" },
      { status: 400 },
    );
  }

  try {
    const payload = await buildFamilyTreeDebugExport(parsed.data.userId, {
      skipRepair: parsed.data.skipRepair,
    });

    await logAdminAudit({
      actorId: authResult.userId,
      action: "family_tree.export_debug",
      targetType: "user",
      targetId: parsed.data.userId,
      metadata: {
        nodeCount: payload.meta.nodeCount,
        relationshipCount: payload.meta.relationshipCount,
        skipRepair: payload.meta.skipRepair,
      },
    });

    const body = `${JSON.stringify(payload, null, 2)}\n`;
    const filename = familyTreeDebugFilename(parsed.data.userId);
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
