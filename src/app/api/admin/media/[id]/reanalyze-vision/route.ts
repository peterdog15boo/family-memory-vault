import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdminApi } from "@/lib/auth/admin";
import { getDb } from "@/lib/db";
import { media } from "@/lib/db/schema";
import {
  analyzeAndStoreSceneForMedia,
  maybeEnqueueSceneAnalysisForMedia,
} from "@/lib/media/scene";

/**
 * POST /api/admin/media/[id]/reanalyze-vision
 *
 * Force re-run visual analysis for a single clean photo (admin / dev).
 * Body: { "runInline"?: boolean } — default enqueues a media.scene job.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const authResult = await requireAdminApi();
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }

  const { id: mediaId } = await context.params;
  if (!mediaId?.trim()) {
    return NextResponse.json({ error: "Missing media id" }, { status: 400 });
  }

  let runInline = false;
  try {
    const body = (await request.json().catch(() => null)) as {
      runInline?: boolean;
    } | null;
    runInline = Boolean(body?.runInline);
  } catch {
    // empty body is fine
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  try {
    if (runInline) {
      const result = await analyzeAndStoreSceneForMedia(mediaId, {
        force: true,
      });
      return NextResponse.json({
        ok: true,
        mode: "inline",
        mediaId,
        skipped: result.skipped,
        skipReason: result.skipReason,
        caption: result.result?.caption,
        tags: result.result?.tags?.slice(0, 20),
        objects: result.result?.objects?.slice(0, 20),
        scenes: result.result?.scenes?.slice(0, 12),
        provider: result.result?.provider,
      });
    }

    const job = await maybeEnqueueSceneAnalysisForMedia(row, {
      force: true,
      source: "api.admin.reanalyze-vision",
    });

    return NextResponse.json({
      ok: true,
      mode: "enqueue",
      mediaId,
      jobId: job?.id ?? null,
      enqueued: Boolean(job),
    });
  } catch (error) {
    console.error("[api.admin.reanalyze-vision] failed", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Visual re-analysis failed",
      },
      { status: 500 },
    );
  }
}
