import { NextResponse } from "next/server";
import { requirePeopleApiUser, peopleApiErrorResponse } from "@/lib/people/http";
import {
  deletePersonStoryPost,
  PersonStoryPostError,
  PERSON_STORY_POST_MAX_LENGTH,
  updatePersonStoryPost,
} from "@/lib/people/story-posts";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

type RouteContext = {
  params: Promise<{ id: string; postId: string }>;
};

function postErrorResponse(error: unknown, fallback: string) {
  if (error instanceof PersonStoryPostError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  return peopleApiErrorResponse(error, fallback);
}

/**
 * PATCH /api/people/[id]/story/posts/[postId] — edit own post.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requirePeopleApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `person-story:${userId}`,
    RATE_LIMITS.mediaMutate.limit,
    RATE_LIMITS.mediaMutate.windowMs,
  );
  if (limited) return limited;

  const { id, postId } = await context.params;
  if (!id?.trim() || !postId?.trim()) {
    return NextResponse.json(
      { error: "Missing person or post id", code: "validation" },
      { status: 400 },
    );
  }

  let body: { body?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "validation" },
      { status: 400 },
    );
  }

  if (typeof body.body !== "string") {
    return NextResponse.json(
      { error: 'Provide "body" as a string.', code: "validation" },
      { status: 400 },
    );
  }
  if (body.body.length > PERSON_STORY_POST_MAX_LENGTH * 2) {
    return NextResponse.json(
      {
        error: `Story must be at most ${PERSON_STORY_POST_MAX_LENGTH} characters.`,
        code: "validation",
      },
      { status: 400 },
    );
  }

  try {
    const post = await updatePersonStoryPost({
      userId,
      personId: id,
      postId,
      body: body.body,
    });
    return NextResponse.json({ ok: true, post });
  } catch (error) {
    return postErrorResponse(error, "Failed to update post");
  }
}

/**
 * DELETE /api/people/[id]/story/posts/[postId] — author or person owner.
 */
export async function DELETE(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requirePeopleApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `person-story:${userId}`,
    RATE_LIMITS.mediaMutate.limit,
    RATE_LIMITS.mediaMutate.windowMs,
  );
  if (limited) return limited;

  const { id, postId } = await context.params;
  if (!id?.trim() || !postId?.trim()) {
    return NextResponse.json(
      { error: "Missing person or post id", code: "validation" },
      { status: 400 },
    );
  }

  try {
    await deletePersonStoryPost({
      userId,
      personId: id,
      postId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return postErrorResponse(error, "Failed to delete post");
  }
}
