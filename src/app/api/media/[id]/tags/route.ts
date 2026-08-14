import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  getMediaTagsForUser,
  updateMediaUserTags,
} from "@/lib/media/tags";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/media/[id]/tags — AI + user keywords (clean/ready access).
 * `canEdit` is true for owners and family contribute roles; viewers are read-only.
 */
export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;

  const { id } = await context.params;
  if (!id?.trim()) {
    return apiError("Missing media id", { status: 400, code: "validation" });
  }

  try {
    const payload = await getMediaTagsForUser(authResult.userId, id);
    if (!payload) {
      return apiError("Media not found", { status: 404, code: "not_found" });
    }
    return NextResponse.json(payload);
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to load media tags");
  }
}

/**
 * PATCH /api/media/[id]/tags — edit user tags and dismiss AI tags.
 *
 * Body (any combination):
 * - { "userTags": string[] } — full replace of user tags
 * - { "add": string[] } — add user tags
 * - { "remove": string[] } — remove tags (case-insensitive). Removes from
 *   user tags; if the label exists on AI arrays, dismisses it permanently
 *   for this media (re-analysis will not restore it).
 *
 * Requires canEditMedia (owner or family contribute). Viewers get 403/404.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `media-tags:${userId}`,
    RATE_LIMITS.mediaMutate.limit,
    RATE_LIMITS.mediaMutate.windowMs,
  );
  if (limited) return limited;

  const { id } = await context.params;
  if (!id?.trim()) {
    return apiError("Missing media id", { status: 400, code: "validation" });
  }

  let body: {
    userTags?: string[];
    add?: string[];
    remove?: string[];
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError("Invalid JSON body", { status: 400, code: "validation" });
  }

  if (
    body.userTags === undefined &&
    body.add === undefined &&
    body.remove === undefined
  ) {
    return apiError(
      "Provide userTags, add, and/or remove.",
      { status: 400, code: "validation" },
    );
  }

  try {
    const payload = await updateMediaUserTags({
      userId,
      mediaId: id,
      userTags: body.userTags,
      add: body.add,
      remove: body.remove,
    });
    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/not found/i.test(message)) {
      return apiError("Media not found", { status: 404, code: "not_found" });
    }
    return apiErrorFromUnknown(error, "Failed to update media tags");
  }
}
