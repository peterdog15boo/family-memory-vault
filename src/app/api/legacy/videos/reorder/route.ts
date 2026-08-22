import { NextResponse } from "next/server";
import { z } from "zod";
import { requireLegacyPlusApiUser } from "@/lib/auth/plan-api";
import { LEGACY_VIDEO_SECTION_TYPES } from "@/lib/db/schema";
import { reorderLegacyVideos } from "@/lib/legacy/videos";
import { serializeLegacyVideo } from "@/lib/legacy/serialize";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

const reorderSchema = z.object({
  sectionType: z.enum(LEGACY_VIDEO_SECTION_TYPES),
  orderedIds: z.array(z.string().min(1).max(64)).max(100),
});

/**
 * POST /api/legacy/videos/reorder — set sort order for all videos in a section.
 */
export async function POST(request: Request) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireLegacyPlusApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `legacy-videos-reorder:${userId}`,
    RATE_LIMITS.legacyVideosMutate.limit,
    RATE_LIMITS.legacyVideosMutate.windowMs,
  );
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", { status: 400, code: "validation" });
  }

  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Invalid reorder request", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    const rows = await reorderLegacyVideos(
      userId,
      parsed.data.sectionType,
      parsed.data.orderedIds,
    );
    return NextResponse.json({
      videos: rows.map((row) => serializeLegacyVideo(row)),
    });
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to reorder legacy videos");
  }
}
