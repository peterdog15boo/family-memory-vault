import { NextResponse } from "next/server";
import {
  buildFamilyTreeDebugExport,
  familyTreeDebugFilename,
} from "@/lib/family-tree/debug-export";
import {
  familyIdFromRequestUrl,
  familyTreeApiErrorResponse,
  requireFamilyTreeViewAccess,
} from "@/lib/family-tree/http";
import { apiError } from "@/lib/http/api-error";

export const runtime = "nodejs";

/**
 * GET /api/family-tree/export — download debug JSON for the current tree.
 * Tree owner only (admins use /api/admin/family-tree/export). No secrets/media URLs.
 */
export async function GET(request: Request) {
  const auth = await requireFamilyTreeViewAccess(familyIdFromRequestUrl(request));
  if (!auth.ok) return auth.response;

  if (!auth.access.isOwner) {
    return apiError("Only the tree owner can export debug JSON.", {
      status: 403,
      code: "forbidden",
    });
  }

  try {
    const payload = await buildFamilyTreeDebugExport(auth.scope, {
      skipRepair: true,
    });
    const body = `${JSON.stringify(payload, null, 2)}\n`;
    const filename = familyTreeDebugFilename(auth.scope);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return familyTreeApiErrorResponse(
      error,
      "Could not export family tree debug JSON.",
    );
  }
}
