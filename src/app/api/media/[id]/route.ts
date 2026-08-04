import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import { deleteMediaOwnedByUser } from "@/lib/media/delete";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * DELETE /api/media/[id] — remove owned media + R2 objects (owner only).
 */
export async function DELETE(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `media-delete:${userId}`,
    RATE_LIMITS.mediaMutate.limit,
    RATE_LIMITS.mediaMutate.windowMs,
  );
  if (limited) return limited;

  const { id } = await context.params;
  if (!id?.trim()) {
    return apiError("Missing media id", { status: 400, code: "validation" });
  }

  try {
    await deleteMediaOwnedByUser(id, userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to delete media");
  }
}
