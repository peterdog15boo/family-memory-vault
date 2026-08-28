import { NextResponse } from "next/server";
import { requirePeopleApiUser, peopleApiErrorResponse } from "@/lib/people/http";
import {
  createPersonStoryPost,
  getPersonStoryFeed,
  PersonStoryPostError,
  PERSON_STORY_POST_MAX_LENGTH,
  refreshPersonStoryNotes,
} from "@/lib/people/story-posts";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

type RouteContext = {
  params: Promise<{ id: string }>;
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
 * GET /api/people/[id]/story — family Story feed (posts + photo notes).
 */
export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requirePeopleApiUser();
  if (!authResult.ok) return authResult.response;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json(
      { error: "Missing person id", code: "validation" },
      { status: 400 },
    );
  }

  try {
    const feed = await getPersonStoryFeed(authResult.userId, id);
    return NextResponse.json(feed);
  } catch (error) {
    return postErrorResponse(error, "Failed to load story");
  }
}

/**
 * POST /api/people/[id]/story
 * - { "body": "..." } → create a human post
 * - { "refreshNotes": true } or legacy { "refresh": true } → AI notes only
 */
export async function POST(request: Request, context: RouteContext) {
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

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json(
      { error: "Missing person id", code: "validation" },
      { status: 400 },
    );
  }

  let body: {
    body?: unknown;
    refreshNotes?: unknown;
    refresh?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "validation" },
      { status: 400 },
    );
  }

  if (body.refreshNotes === true || body.refresh === true) {
    try {
      const notes = await refreshPersonStoryNotes({
        userId,
        personId: id,
      });
      return NextResponse.json({
        ok: true,
        notes,
        story: {
          body: notes.body,
          sourceCaptionCount: notes.sourceCount,
          generatedAt: notes.generatedAt,
          generatedBy: notes.generatedBy,
        },
      });
    } catch (error) {
      return postErrorResponse(error, "Failed to refresh notes");
    }
  }

  if (typeof body.body !== "string") {
    return NextResponse.json(
      {
        error: 'Provide "body" to post, or refreshNotes: true.',
        code: "validation",
      },
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
    const post = await createPersonStoryPost({
      userId,
      personId: id,
      body: body.body,
    });
    return NextResponse.json({ ok: true, post }, { status: 201 });
  } catch (error) {
    return postErrorResponse(error, "Failed to post story");
  }
}
