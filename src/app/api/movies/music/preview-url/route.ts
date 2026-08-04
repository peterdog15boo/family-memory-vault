import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMemoryApiUser } from "@/lib/memories/http";
import { movieApiErrorResponse } from "@/lib/movies/serialize";
import { createMovieMusicPreviewUrl } from "@/lib/movies/music/upload";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";

const bodySchema = z.object({
  key: z.string().min(1).max(512),
});

/**
 * POST /api/movies/music/preview-url — short-lived signed GET for an uploaded track.
 */
export async function POST(request: Request) {
  const authResult = await requireMemoryApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `movie-music-preview:${userId}`,
    RATE_LIMITS.mediaDownload.limit,
    RATE_LIMITS.mediaDownload.windowMs,
  );
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing music key." }, { status: 400 });
  }

  try {
    const result = await createMovieMusicPreviewUrl({
      userId,
      key: parsed.data.key,
    });
    return NextResponse.json({
      url: result.url,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    return movieApiErrorResponse(error, "Could not preview music");
  }
}
