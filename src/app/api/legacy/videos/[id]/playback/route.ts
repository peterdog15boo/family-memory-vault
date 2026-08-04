import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth/api";
import { getLegacyVideoForUser } from "@/lib/legacy/videos";
import { issueLegacyVideoMediaUrls } from "@/lib/legacy/video-playback";
import { apiError, apiErrorFromUnknown } from "@/lib/http/api-error";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { rejectUntrustedOrigin } from "@/lib/security/origin";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  /**
   * "playback" — full video (+ optional poster)
   * "thumbnail" — poster only; never signs the video object
   */
  purpose: z.enum(["playback", "thumbnail"]).default("playback"),
});

/**
 * POST /api/legacy/videos/[id]/playback
 * Owner-only short-lived signed URLs for playback or poster.
 */
export async function POST(request: Request, context: RouteContext) {
  const originBlocked = rejectUntrustedOrigin(request);
  if (originBlocked) return originBlocked;

  const authResult = await requireApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `legacy-videos-playback:${userId}`,
    RATE_LIMITS.legacyVideosMutate.limit,
    RATE_LIMITS.legacyVideosMutate.windowMs,
  );
  if (limited) return limited;

  const { id } = await context.params;
  if (!id?.trim()) {
    return apiError("Missing video id", { status: 400, code: "validation" });
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
    return apiError("Invalid playback request", {
      status: 400,
      code: "validation",
      details: parsed.error.flatten(),
    });
  }

  try {
    const row = await getLegacyVideoForUser(id, userId);
    if (!row) {
      return apiError("Legacy video not found.", {
        status: 404,
        code: "not_found",
      });
    }

    const media = await issueLegacyVideoMediaUrls({
      video: row,
      purpose: parsed.data.purpose,
      viewerUserId: userId,
      accessMode: "owner",
    });

    if (parsed.data.purpose === "thumbnail" && !media.thumbnailUrl) {
      return apiError("No poster is available for this video.", {
        status: 404,
        code: "not_found",
      });
    }

    if (parsed.data.purpose === "playback" && !media.playbackUrl) {
      return apiError("Playback is unavailable for this video.", {
        status: 404,
        code: "not_found",
      });
    }

    return NextResponse.json(media);
  } catch (error) {
    return apiErrorFromUnknown(error, "Failed to issue media URL");
  }
}
