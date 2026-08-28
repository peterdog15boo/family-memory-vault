import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  getMediaCaptionForUser,
  MEDIA_CAPTION_MAX_LENGTH,
  updateMediaCaption,
} from "@/lib/media/captions";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/media/[id]/caption — user caption (clean/ready access).
 */
export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;

  const { id } = await context.params;
  if (!id?.trim()) {
    return apiError("Missing media id", { status: 400, code: "validation" });
  }

  try {
    const payload = await getMediaCaptionForUser(authResult.userId, id);
    if (!payload) {
      return apiError("Media not found", { status: 404, code: "not_found" });
    }
    return NextResponse.json(payload);
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to load caption");
  }
}

/**
 * PATCH /api/media/[id]/caption — set or clear a user caption.
 *
 * Body: { "caption": string | null }
 * Empty / whitespace-only clears to null.
 * Requires canEditMedia (owner or family contribute).
 */
export async function PATCH(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `media-caption:${userId}`,
    RATE_LIMITS.mediaMutate.limit,
    RATE_LIMITS.mediaMutate.windowMs,
  );
  if (limited) return limited;

  const { id } = await context.params;
  if (!id?.trim()) {
    return apiError("Missing media id", { status: 400, code: "validation" });
  }

  let body: { caption?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError("Invalid JSON body", { status: 400, code: "validation" });
  }

  if (body.caption === undefined) {
    return apiError('Provide "caption" (string or null).', {
      status: 400,
      code: "validation",
    });
  }

  if (typeof body.caption === "string" && body.caption.length > MEDIA_CAPTION_MAX_LENGTH * 2) {
    // Reject absurd payloads before normalize truncates.
    return apiError(`Caption must be at most ${MEDIA_CAPTION_MAX_LENGTH} characters.`, {
      status: 400,
      code: "validation",
    });
  }

  if (body.caption !== null && typeof body.caption !== "string") {
    return apiError("Caption must be a string or null.", {
      status: 400,
      code: "validation",
    });
  }

  try {
    const payload = await updateMediaCaption({
      userId,
      mediaId: id,
      caption: body.caption,
    });
    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/not found/i.test(message)) {
      return apiError("Media not found", { status: 404, code: "not_found" });
    }
    return apiErrorFromUnknown(error, "Failed to update caption");
  }
}
