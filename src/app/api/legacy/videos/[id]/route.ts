import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api";
import {
  deleteLegacyVideo,
  getLegacyVideoForUser,
  updateLegacyVideo,
} from "@/lib/legacy/videos";
import { serializeLegacyVideo } from "@/lib/legacy/serialize";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).optional().nullable(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
  isPrimary: z.boolean().optional(),
});

/**
 * PATCH /api/legacy/videos/[id] — update title, description, or sort order.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `legacy-videos-patch:${userId}`,
    RATE_LIMITS.legacyVideosMutate.limit,
    RATE_LIMITS.legacyVideosMutate.windowMs,
  );
  if (limited) return limited;

  const { id } = await context.params;
  if (!id?.trim()) {
    return apiError("Missing video id", { status: 400, code: "validation" });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", { status: 400, code: "validation" });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid update", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    const row = await updateLegacyVideo(id, userId, {
      title: parsed.data.title,
      description: parsed.data.description,
      sortOrder: parsed.data.sortOrder,
      isPrimary: parsed.data.isPrimary,
    });
    return NextResponse.json({ video: serializeLegacyVideo(row) });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to update legacy video");
  }
}

/**
 * DELETE /api/legacy/videos/[id] — owner-only remove DB + R2 objects.
 */
export async function DELETE(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `legacy-videos-delete:${userId}`,
    RATE_LIMITS.legacyVideosMutate.limit,
    RATE_LIMITS.legacyVideosMutate.windowMs,
  );
  if (limited) return limited;

  const { id } = await context.params;
  if (!id?.trim()) {
    return apiError("Missing video id", { status: 400, code: "validation" });
  }

  try {
    await deleteLegacyVideo(id, userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to delete legacy video");
  }
}

/**
 * GET /api/legacy/videos/[id] — metadata only (no signed URLs).
 */
export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const { id } = await context.params;
  if (!id?.trim()) {
    return apiError("Missing video id", { status: 400, code: "validation" });
  }

  try {
    const row = await getLegacyVideoForUser(id, userId);
    if (!row) {
      return apiError("Legacy video not found.", {
        status: 404,
        code: "not_found",
      });
    }
    return NextResponse.json({ video: serializeLegacyVideo(row) });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to load legacy video");
  }
}
