import { NextResponse } from "next/server";
import { z } from "zod";
import {
  FamilyChatError,
  listChatParticipantsForOwner,
  setChatParticipantIncluded,
} from "@/lib/family-chat";
import {
  familyApiErrorResponse,
  requireFamilyApiOwner,
  requireFamilyApiUser,
} from "@/lib/families/http";
import { apiErrorFromUnknown } from "@/lib/http/api-error";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  userId: z.string().trim().min(1),
  included: z.boolean(),
});

function chatErrorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof FamilyChatError) {
    const status =
      error.code === "forbidden" || error.code === "excluded"
        ? 403
        : error.code === "not_found"
          ? 404
          : 400;
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status },
    );
  }
  return apiErrorFromUnknown(error, fallback);
}

/**
 * GET /api/family/[id]/chat/participants — owner: all active members + included flag.
 */
export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireFamilyApiUser();
  if (!authResult.ok) return authResult.response;

  const { id: familyId } = await context.params;

  try {
    await requireFamilyApiOwner(familyId, authResult.userId);
    const participants = await listChatParticipantsForOwner({
      familyId,
      actorUserId: authResult.userId,
    });
    return NextResponse.json({ participants });
  } catch (error) {
    return familyApiErrorResponse(error, "Failed to load chat participants");
  }
}

/**
 * PATCH /api/family/[id]/chat/participants — owner toggles Include in family chat.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const authResult = await requireFamilyApiUser();
  if (!authResult.ok) return authResult.response;

  const { id: familyId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await requireFamilyApiOwner(familyId, authResult.userId);
    const participant = await setChatParticipantIncluded({
      familyId,
      actorUserId: authResult.userId,
      targetUserId: parsed.data.userId,
      included: parsed.data.included,
    });
    return NextResponse.json({
      participant: {
        userId: participant.userId,
        included: participant.included,
      },
    });
  } catch (error) {
    return chatErrorResponse(error, "Failed to update chat access");
  }
}
