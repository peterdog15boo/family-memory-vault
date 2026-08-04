import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMemoryApiUser } from "@/lib/memories/http";
import { movieApiErrorResponse } from "@/lib/movies/serialize";
import { completeMovieMusicUpload } from "@/lib/movies/music/upload";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";

const completeSchema = z.object({
  key: z.string().min(1).max(512),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(3).max(100),
});

/**
 * POST /api/movies/music/complete — promote temp music upload into movies/{user}/music/.
 */
export async function POST(request: Request) {
  const authResult = await requireMemoryApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `movie-music-complete:${userId}`,
    RATE_LIMITS.mediaComplete.limit,
    RATE_LIMITS.mediaComplete.windowMs,
  );
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid complete request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await completeMovieMusicUpload({
      userId,
      tempKey: parsed.data.key,
      filename: parsed.data.filename,
      contentType: parsed.data.contentType,
    });
    return NextResponse.json({
      key: result.key,
      label: result.label,
      contentType: result.contentType,
      sizeBytes: result.sizeBytes,
    });
  } catch (error) {
    return movieApiErrorResponse(error, "Could not save music upload");
  }
}
