import { NextResponse } from "next/server";
import { z } from "zod";
import {
  peopleApiErrorResponse,
  requirePeopleApiUser,
} from "@/lib/people/http";
import { regeneratePersonStory } from "@/lib/people/stories";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const bodySchema = z
  .object({
    /** Explicit refresh from the Person page. */
    refresh: z.boolean().optional(),
  })
  .optional();

/**
 * POST /api/people/[id]/story — regenerate Story from visible photo captions.
 * Owner-scoped. Empty captions clear the stored story (no invented biography).
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

  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      const raw = await request.json().catch(() => ({}));
      bodySchema.parse(raw);
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid request body", code: "validation" },
      { status: 400 },
    );
  }

  try {
    const story = await regeneratePersonStory({
      userId,
      personId: id,
      generatedBy: "user",
    });
    return NextResponse.json({ ok: true, story });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/not found/i.test(message)) {
      return NextResponse.json(
        { error: "Person not found", code: "not_found" },
        { status: 404 },
      );
    }
    return peopleApiErrorResponse(error, "Failed to update story");
  }
}
