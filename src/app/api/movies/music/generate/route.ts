import { after, NextResponse } from "next/server";
import { z } from "zod";
import { requireMemoryApiUser } from "@/lib/memories/http";
import { MovieError } from "@/lib/movies/errors";
import { movieApiErrorResponse } from "@/lib/movies/serialize";
import {
  enqueueAiSoundtrackJob,
  isAiMusicGenerationAvailable,
  processAiSoundtrackJob,
  serializeAiSoundtrackJob,
  type AiSoundtrackJobPayload,
} from "@/lib/movies/music/ai";
import {
  assertGateAllowed,
  canGenerateAiSoundtrack,
  PlanGateError,
} from "@/lib/plans/gates";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { MOVIE_STYLE_OPTIONS } from "@/lib/movies/settings";

const bodySchema = z.object({
  themeId: z.enum(MOVIE_STYLE_OPTIONS).optional().nullable(),
  mood: z.string().trim().max(120).optional().nullable(),
  userPrompt: z.string().trim().max(240).optional().nullable(),
  durationSeconds: z.number().min(10).max(600),
  forceInstrumental: z.boolean().optional(),
  providerId: z.string().trim().min(1).max(40).optional(),
});

/**
 * POST /api/movies/music/generate — start AI soundtrack generation.
 * Returns a job id; poll GET /api/movies/music/generate/[jobId].
 */
export async function POST(request: Request) {
  const authResult = await requireMemoryApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const limited = enforceRateLimit(
    `ai-soundtrack:${userId}`,
    RATE_LIMITS.aiSoundtrack.limit,
    RATE_LIMITS.aiSoundtrack.windowMs,
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
    return NextResponse.json(
      { error: "Invalid generate request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    if (!isAiMusicGenerationAvailable()) {
      throw new MovieError(
        "AI soundtrack generation is not configured on this server. Set ELEVENLABS_API_KEY.",
        { retryable: false, code: "validation" },
      );
    }

    try {
      assertGateAllowed(await canGenerateAiSoundtrack(userId));
    } catch (error) {
      if (error instanceof PlanGateError) {
        throw new MovieError(error.message, {
          retryable: false,
          code: "plan_limit",
        });
      }
      throw error;
    }

    const job = await enqueueAiSoundtrackJob({
      userId,
      themeId: parsed.data.themeId,
      mood: parsed.data.mood,
      userPrompt: parsed.data.userPrompt,
      durationSeconds: parsed.data.durationSeconds,
      forceInstrumental: parsed.data.forceInstrumental,
      providerId: parsed.data.providerId,
    });

    after(async () => {
      try {
        await processAiSoundtrackJob(job.id);
      } catch (error) {
        console.error("[api.movies.music.generate] job failed", job.id, error);
      }
    });

    const payload = job.payload as AiSoundtrackJobPayload;
    return NextResponse.json(
      {
        ...serializeAiSoundtrackJob(job, payload),
        notice:
          "AI-generated soundtrack — instrumental bed created for this movie. Generation may take up to a few minutes.",
      },
      { status: 202 },
    );
  } catch (error) {
    return movieApiErrorResponse(error, "Could not start soundtrack generation");
  }
}
