import { NextResponse } from "next/server";
import { z } from "zod";
import { reassignFace } from "@/lib/people";
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

const patchBodySchema = z.object({
  /** Target person, or null to remove the label. */
  personId: z.string().min(1).nullable(),
});

/**
 * GET /api/faces/[id] — not used; faces are listed by media.
 * PATCH /api/faces/[id] — reassign this face to a person (or unassign).
 */
export async function PATCH(request: Request, context: RouteContext) {
  const authResult = await requirePeopleApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing face id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const face = await reassignFace(id, parsed.data.personId, userId);
    const labeled = await listFacesForMediaLabeled(face.mediaId, userId);
    return NextResponse.json({
      face: {
        id: face.id,
        mediaId: face.mediaId,
        personId: face.personId,
      },
      faces: labeled.map(serializeMediaFaceLabel),
    });
  } catch (error) {
    return peopleApiErrorResponse(error, "Failed to update face label");
  }
}
