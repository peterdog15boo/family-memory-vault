import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  deleteMediaComment,
  MEDIA_COMMENT_MAX_LENGTH,
  MediaCommentError,
  updateMediaComment,
} from "@/lib/media/comments";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

type RouteContext = {
  params: Promise<{ id: string; commentId: string }>;
};

function commentErrorResponse(error: unknown, fallback: string) {
  if (error instanceof MediaCommentError) {
    return apiError(error.message, {
      status: error.status,
      code: error.code,
    });
  }
  return apiErrorFromUnknown(error, fallback);
}

/**
 * PATCH /api/media/[id]/comments/[commentId] — edit own comment.
 * Body: { "body": string }
 */
export async function PATCH(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `media-comment:${userId}`,
    RATE_LIMITS.mediaMutate.limit,
    RATE_LIMITS.mediaMutate.windowMs,
  );
  if (limited) return limited;

  const { id, commentId } = await context.params;
  if (!id?.trim() || !commentId?.trim()) {
    return apiError("Missing media or comment id", {
      status: 400,
      code: "validation",
    });
  }

  let body: { body?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError("Invalid JSON body", { status: 400, code: "validation" });
  }

  if (typeof body.body !== "string") {
    return apiError('Provide "body" as a string.', {
      status: 400,
      code: "validation",
    });
  }
  if (body.body.length > MEDIA_COMMENT_MAX_LENGTH * 2) {
    return apiError(
      `Comment must be at most ${MEDIA_COMMENT_MAX_LENGTH} characters.`,
      { status: 400, code: "validation" },
    );
  }

  try {
    const entry = await updateMediaComment({
      userId,
      mediaId: id,
      commentId,
      body: body.body,
    });
    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    return commentErrorResponse(error, "Failed to update comment");
  }
}

/**
 * DELETE /api/media/[id]/comments/[commentId] — author or media owner.
 */
export async function DELETE(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `media-comment:${userId}`,
    RATE_LIMITS.mediaMutate.limit,
    RATE_LIMITS.mediaMutate.windowMs,
  );
  if (limited) return limited;

  const { id, commentId } = await context.params;
  if (!id?.trim() || !commentId?.trim()) {
    return apiError("Missing media or comment id", {
      status: 400,
      code: "validation",
    });
  }

  try {
    await deleteMediaComment({
      userId,
      mediaId: id,
      commentId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return commentErrorResponse(error, "Failed to delete comment");
  }
}
