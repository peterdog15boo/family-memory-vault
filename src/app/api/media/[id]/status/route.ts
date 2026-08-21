import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { getDb } from "@/lib/db";
import { media } from "@/lib/db/schema";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/media/[id]/status — owner-only lifecycle poll for intake UIs.
 */
export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing media id" }, { status: 400 });
  }

  const db = getDb();
  const [row] = await db
    .select({
      id: media.id,
      status: media.status,
      moderationStatus: media.moderationStatus,
      pendingMemoryId: media.pendingMemoryId,
      originalFilename: media.originalFilename,
      type: media.type,
      thumbnailKey: media.thumbnailKey,
      createdAt: media.createdAt,
    })
    .from(media)
    .where(and(eq(media.id, id), eq(media.userId, userId)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const cleanReady =
    row.moderationStatus === "clean" && row.status === "ready";

  return NextResponse.json({
    mediaId: row.id,
    status: row.status,
    moderationStatus: row.moderationStatus,
    cleanReady,
    pendingMemoryId: row.pendingMemoryId,
    filename: row.originalFilename,
    type: row.type,
    createdAt: row.createdAt.toISOString(),
  });
}
