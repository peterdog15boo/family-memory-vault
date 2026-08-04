import { after, NextResponse } from "next/server";
import { z } from "zod";
import {
  memoryApiErrorResponse,
  requireMemoryApiUser,
} from "@/lib/memories/http";
import { createMovieJob } from "@/lib/movies/lifecycle";
import { listUserMoviesWithMemory } from "@/lib/movies/list";
import { MOVIE_STYLE_OPTIONS, MOVIE_TRANSITIONS, COLOR_FILTERS, COLOR_FILTER_INTENSITIES } from "@/lib/movies/settings";
import {
  movieApiErrorResponse,
  serializeMovie,
} from "@/lib/movies/serialize";
import {
  enforceRateLimit,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { drainUntilMovieTerminal } from "@/workers/movies";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const createBodySchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  style: z.enum(MOVIE_STYLE_OPTIONS).optional(),
  settings: z
    .object({
      targetDurationSeconds: z.number().min(5).max(600).optional(),
      photoDurationMs: z.number().int().min(1000).max(15000).optional(),
      transition: z.enum(MOVIE_TRANSITIONS).nullable().optional(),
      transitionDurationMs: z
        .number()
        .int()
        .min(100)
        .max(3000)
        .nullable()
        .optional(),
      includeTitles: z.boolean().optional(),
      aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
      zoomIntensity: z.enum(["off", "subtle", "medium", "strong"]).optional(),
      zoomDirection: z
        .enum(["alternate", "always-in", "always-out", "off"])
        .optional(),
      presetId: z.string().min(1).nullable().optional(),
      qualityMode: z.enum(["standard", "fast", "ultra"]).optional(),
      colorFilter: z.enum(COLOR_FILTERS).nullable().optional(),
      colorFilterIntensity: z.enum(COLOR_FILTER_INTENSITIES).optional(),
      filterGrain: z.boolean().nullable().optional(),
      filterVignette: z.boolean().nullable().optional(),
      musicSuggestionId: z.string().min(1).nullable().optional(),
      musicSource: z.enum(["none", "library", "upload"]).optional(),
      musicTrackId: z.string().min(1).max(80).nullable().optional(),
      musicUploadKey: z.string().min(1).max(512).nullable().optional(),
      musicLabel: z.string().trim().min(1).max(120).nullable().optional(),
      musicVolume: z.number().min(0).max(1).optional(),
      musicFadeInMs: z.number().int().min(0).max(10000).optional(),
      musicFadeOutMs: z.number().int().min(0).max(15000).optional(),
      musicLoop: z.boolean().optional(),
      musicAiGenerated: z.boolean().optional(),
      musicAiProvider: z.string().min(1).max(40).nullable().optional(),
    })
    .optional(),
});

/**
 * GET /api/memories/[id]/movies — list movies for a memory (owner only).
 */
export async function GET(_request: Request, context: RouteContext) {
  const authResult = await requireMemoryApiUser();
  if (!authResult.ok) return authResult.response;

  const { id: memoryId } = await context.params;
  if (!memoryId?.trim()) {
    return NextResponse.json({ error: "Missing memory id" }, { status: 400 });
  }

  try {
    const rows = await listUserMoviesWithMemory(authResult.userId, {
      memoryId,
      limit: 24,
    });
    const movies = await Promise.all(
      rows.map((row) => serializeMovie(row, { includeUrls: true })),
    );
    return NextResponse.json({ movies });
  } catch (error) {
    return memoryApiErrorResponse(error, "Failed to list movies");
  }
}

/**
 * POST /api/memories/[id]/movies — queue a movie render (owner only).
 * Kicks a background drain so local/dev often completes without a separate worker.
 */
export async function POST(request: Request, context: RouteContext) {
  const authResult = await requireMemoryApiUser();
  if (!authResult.ok) return authResult.response;
  const { userId } = authResult;

  const { id: memoryId } = await context.params;
  if (!memoryId?.trim()) {
    return NextResponse.json({ error: "Missing memory id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid movie options.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const limited = enforceRateLimit(
      `movie-create:${userId}`,
      RATE_LIMITS.movieCreate.limit,
      RATE_LIMITS.movieCreate.windowMs,
    );
    if (limited) return limited;

    const created = await createMovieJob({
      memoryId,
      userId,
      title: parsed.data.title,
      style: parsed.data.style,
      settings: parsed.data.settings,
    });

    // Dev convenience only — never drain the global movie queue from a user request in production.
    if (process.env.NODE_ENV === "development") {
      after(async () => {
        try {
          const result = await drainUntilMovieTerminal(created.id, {
            maxJobs: 5,
          });
          console.info("[api.memories.movies] Background drain", {
            movieId: created.id,
            processed: result.processed.length,
            failures: result.failures.length,
            finalStatus: result.finalStatus,
          });
        } catch (error) {
          console.error(
            "[api.memories.movies] Background drain failed",
            created.id,
            error,
          );
        }
      });
    }

    const movie = await serializeMovie(created, { includeUrls: false });
    return NextResponse.json({ movie }, { status: 201 });
  } catch (error) {
    return movieApiErrorResponse(error, "Failed to create movie");
  }
}
