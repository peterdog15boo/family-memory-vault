import { NextResponse } from "next/server";
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
    return NextResponse.json({
      faces: faces.map(serializeMediaFaceLabel),
    });
  } catch (error) {
    return peopleApiErrorResponse(error, "Failed to load faces");
  }
}
