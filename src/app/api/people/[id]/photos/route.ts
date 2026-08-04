import { NextResponse } from "next/server";
import { z } from "zod";
import {
  assignMediaToPerson,
  unassignMediaFromPerson,
} from "@/lib/people";
import {
  peopleApiErrorResponse,
  requirePeopleApiUser,
} from "@/lib/people/http";
import {
  getPersonWithPhotos,
  serializePersonDetail,
} from "@/lib/people/queries";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const mediaIdsBodySchema = z.object({
  mediaIds: z.array(z.string().min(1)).min(1).max(50),
});

/**
 * POST /api/people/[id]/photos
 *
 * Manually assign clean/ready owner photos or videos to this person.
 * Uses an unlabeled detected face when present; otherwise creates a manual
 * full-frame face link (works when auto recognition missed them).
 */
export async function POST(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requirePeopleApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `people-photos:${userId}`,
    RATE_LIMITS.mediaMutate.limit,
    RATE_LIMITS.mediaMutate.windowMs,
  );
  if (limited) return limited;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing person id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = mediaIdsBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await assignMediaToPerson({
      userId,
      personId: id,
      mediaIds: parsed.data.mediaIds,
    });
    const person = await getPersonWithPhotos(id, userId);
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    return NextResponse.json({
      ...result,
      person: serializePersonDetail(person),
    });
  } catch (error) {
    return peopleApiErrorResponse(error, "Failed to add media to person");
  }
}

/**
 * DELETE /api/people/[id]/photos
 *
 * Unassign this person from the given photos or videos (faces stay unlabeled).
 */
export async function DELETE(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requirePeopleApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `people-photos-del:${userId}`,
    RATE_LIMITS.mediaMutate.limit,
    RATE_LIMITS.mediaMutate.windowMs,
  );
  if (limited) return limited;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing person id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = mediaIdsBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await unassignMediaFromPerson({
      userId,
      personId: id,
      mediaIds: parsed.data.mediaIds,
    });
    const person = await getPersonWithPhotos(id, userId);
    if (!person) {
      return NextResponse.json({ error: "Person not found" }, { status: 404 });
    }
    return NextResponse.json({
      ...result,
      person: serializePersonDetail(person),
    });
  } catch (error) {
    return peopleApiErrorResponse(error, "Failed to remove media from person");
  }
}
