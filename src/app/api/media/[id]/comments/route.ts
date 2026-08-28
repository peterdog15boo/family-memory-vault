import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  createMediaComment,
  getMediaCommentThread,
  MEDIA_COMMENT_MAX_LENGTH,
  MediaCommentError,
} from "@/lib/media/comments";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

type RouteContext = {
  params: Promise<{ id: string }>;
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
 * GET /api/media/[id]/comments — family mini-feed (caption + comments).
 */
export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;

  const { id } = await context.params;
  if (!id?.trim()) {
    return apiError("Missing media id", { status: 400, code: "validation" });
  }

  try {
    const payload = await getMediaCommentThread(authResult.userId, id);
    return NextResponse.json(payload);
  } catch (error) {
    return commentErrorResponse(error, "Failed to load comments");
  }
}

/**
 * POST /api/media/[id]/comments — add a comment (anyone who can view the media).
 * Body: { "body": string }
 */
export async function POST(request: Request, context: RouteContext) {
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

  const { id } = await context.params;
  if (!id?.trim()) {
    return apiError("Missing media id", { status: 400, code: "validation" });
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
    const entry = await createMediaComment({
      userId,
      mediaId: id,
      body: body.body,
    });
    return NextResponse.json({ ok: true, entry }, { status: 201 });
  } catch (error) {
    return commentErrorResponse(error, "Failed to post comment");
  }
}
