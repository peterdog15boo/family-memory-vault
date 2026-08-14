import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { enqueueUnlabeledSceneAnalysisForUser } from "@/lib/media/scene";

/**
 * POST /api/admin/media/enqueue-scene-analysis
 *
 * Admin/dev path: enqueue scene analysis for unlabeled clean media.
 * Body: { "userId": string, "limit"?: number, "force"?: boolean }
 *
 * Does not block Ask AI queries — operators run this when coverage is low.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const authResult = await requireAdminApi();
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }

  let body: {
    userId?: string;
    limit?: number;
    force?: boolean;
  } | null = null;
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = null;
  }

  const userId = body?.userId?.trim();
  if (!userId) {
    return NextResponse.json(
      { error: "userId is required" },
      { status: 400 },
    );
  }

  try {
    const result = await enqueueUnlabeledSceneAnalysisForUser(userId, {
      limit: body?.limit,
      force: body?.force ?? true,
      source: "api.admin.enqueue-scene-analysis",
    });
    return NextResponse.json({
      ok: true,
      userId,
      ...result,
    });
  } catch (error) {
    console.error("[api.admin.enqueue-scene-analysis] failed", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to enqueue scene analysis",
      },
      { status: 500 },
    );
  }
}
