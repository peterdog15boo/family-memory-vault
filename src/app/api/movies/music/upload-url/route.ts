import { NextResponse } from "next/server";
import { requireMemoryApiUser } from "@/lib/memories/http";
import { movieApiErrorResponse } from "@/lib/movies/serialize";
import {
  createMovieMusicUploadUrl,
  movieMusicUploadRequestSchema,
} from "@/lib/movies/music/upload";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";

/**
 * POST /api/movies/music/upload-url — presigned PUT for a soundtrack upload.
 */
export async function POST(request: Request) {
  const authResult = await requireMemoryApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `movie-music-upload:${userId}`,
    RATE_LIMITS.uploadUrl.limit,
    RATE_LIMITS.uploadUrl.windowMs,
  );
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = movieMusicUploadRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid upload request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await createMovieMusicUploadUrl({
      userId,
      filename: parsed.data.filename,
      contentType: parsed.data.contentType,
      sizeBytes: parsed.data.size,
    });
    return NextResponse.json(result);
  } catch (error) {
    return movieApiErrorResponse(error, "Could not create music upload URL");
  }
}
