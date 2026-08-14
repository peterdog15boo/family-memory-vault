import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { maybeEnqueueFaceDetectionForMedia } from "@/lib/faces/pipeline";
import {
  peopleApiErrorResponse,
  requirePeopleApiUser,
} from "@/lib/people/http";
import {
  listFacesForMediaLabeled,
  serializeMediaFaceLabel,
} from "@/lib/people/queries";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/media/[id]/faces — labeled faces on clean photo/video (for tagging).
 * If the viewer has no face rows yet (common for shared family media), best-effort
 * enqueue detection/matching for their People graph.
 */
export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requirePeopleApiUser();
  if (!authResult.ok) return authResult.response;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing media id" }, { status: 400 });
  }

  try {
    const faces = await listFacesForMediaLabeled(id, authResult.userId);

    if (faces.length === 0) {
      const db = getDb();
      const [row] = await db
        .select({
          id: media.id,
          userId: media.userId,
          type: media.type,
          status: media.status,
          moderationStatus: media.moderationStatus,
          contentType: media.contentType,
        })
        .from(media)
        .where(eq(media.id, id))
        .limit(1);
      if (row) {
        await maybeEnqueueFaceDetectionForMedia(row, {
          actorUserId: authResult.userId,
          source: "api.media.faces",
        });
      }
    }

    return NextResponse.json({
      faces: faces.map(serializeMediaFaceLabel),
    });
  } catch (error) {
    return peopleApiErrorResponse(error, "Failed to load faces");
  }
}
