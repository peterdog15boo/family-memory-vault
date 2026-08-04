import { z } from "zod";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api";
import { createMediaDownloadUrl } from "@/lib/media/download-url";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";
import { isR2Configured } from "@/lib/upload/constants";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  purpose: z.enum(["thumbnail", "display", "original"]).default("display"),
});

/**
 * POST /api/media/[id]/download-url
 * Short-lived signed GET for thumbnail (grid), display (lightbox), or original.
 */
export async function POST(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;
  const { id } = await context.params;

  if (!id?.trim()) {
    return apiError("Missing media id", { status: 400, code: "validation" });
  }

  const limited = enforceRateLimit(
    `media-download:${userId}`,
    RATE_LIMITS.mediaDownload.limit,
    RATE_LIMITS.mediaDownload.windowMs,
  );
  if (limited) return limited;

  if (!isR2Configured()) {
    return apiError(
      "Object storage is not configured yet. Add R2 credentials to .env.local.",
      { status: 503, code: "r2_not_configured" },
    );
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return apiError("Invalid JSON body", { status: 400, code: "validation" });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid request", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    const signed = await createMediaDownloadUrl({
      userId,
      mediaId: id,
      purpose: parsed.data.purpose,
    });

    if (!signed) {
      return apiError("Media not found or unavailable.", {
        status: 404,
        code: "not_found",
      });
    }

    return NextResponse.json(signed);
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to issue media download URL");
  }
}
