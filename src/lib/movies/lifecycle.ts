/**
 * Movie job lifecycle helpers (create / status / fetch).
 * Split from the generator so workers can update records without circular imports.
 */

import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  memories,
  movies,
  MOVIE_STATUSES,
  MOVIE_STYLES,
  type Movie,
  type MovieStatus,
  type MovieStyle,
} from "@/lib/db/schema";
import { MovieError } from "@/lib/movies/errors";
import {
  createMovieSettingsInputSchema,
  movieSettingsSchema,
  normalizeMovieSettings,
  type MovieSettings,
} from "@/lib/movies/settings";
import {
  assertWithinMovieActiveJobLimit,
  assertWithinMovieDailyQuota,
  assertWithinMovieMonthlyQuota,
  countCleanMemoryMedia,
} from "@/lib/movies/quota";
import { incrementMoviesUsage } from "@/lib/plans";
import { enqueueJob } from "@/lib/queue";

export type CreateMovieJobInput = {
  memoryId: string;
  userId: string;
  /** Optional override title; defaults to memory title (or Movie NNN when autoTitle). */
  title?: string;
  style?: MovieStyle;
  settings?: MovieSettings;
  /** Allocate sequential "Movie 001" titles (Simple Mode). */
  autoTitle?: boolean;
};

export type UpdateMovieStatusData = {
  outputKey?: string | null;
  thumbnailKey?: string | null;
  durationSeconds?: number | null;
  errorMessage?: string | null;
  settings?: MovieSettings;
  title?: string;
  style?: MovieStyle;
  /** Set completedAt automatically when status becomes ready|failed unless overridden. */
  completedAt?: Date | null;
};

const updateStatusSchema = z.object({
  outputKey: z.string().min(1).nullable().optional(),
  thumbnailKey: z.string().min(1).nullable().optional(),
  durationSeconds: z.number().min(0).max(3600).nullable().optional(),
  errorMessage: z.string().trim().max(2000).nullable().optional(),
  settings: movieSettingsSchema.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  style: z.enum(MOVIE_STYLES).optional(),
  completedAt: z.date().nullable().optional(),
});

/**
 * Create a queued movie job for an owned memory and enqueue `movie.render`.
 * Returns as soon as the DB row + queue insert succeed — rendering runs in the
 * movie worker (`npm run worker:movies` / POST /api/jobs/movies), not in this request.
 */
export async function createMovieJob(
  memoryId: string,
  userId: string,
  settings?: CreateMovieJobInput["settings"] & {
    title?: string;
    style?: MovieStyle;
  },
): Promise<Movie>;
export async function createMovieJob(
  input: CreateMovieJobInput,
): Promise<Movie>;
export async function createMovieJob(
  memoryIdOrInput: string | CreateMovieJobInput,
  maybeUserId?: string,
  maybeSettings?: CreateMovieJobInput["settings"] & {
    title?: string;
    style?: MovieStyle;
  },
): Promise<Movie> {
  const input: CreateMovieJobInput =
    typeof memoryIdOrInput === "string"
      ? {
          memoryId: memoryIdOrInput,
          userId: maybeUserId ?? "",
          title: maybeSettings?.title,
          style: maybeSettings?.style,
          settings: maybeSettings,
        }
      : memoryIdOrInput;

  if (!input.memoryId?.trim() || !input.userId?.trim()) {
    throw new MovieError("memoryId and userId are required.", {
      retryable: false,
      code: "validation",
    });
  }

  const parsedExtras = createMovieSettingsInputSchema.safeParse({
    ...(input.settings ?? {}),
    title: input.title,
    style: input.style,
  });
  if (!parsedExtras.success) {
    throw new MovieError("Invalid movie settings.", {
      retryable: false,
      code: "validation",
    });
  }

  await assertWithinMovieMonthlyQuota(input.userId);
  await assertWithinMovieDailyQuota(input.userId);
  await assertWithinMovieActiveJobLimit(input.userId);

  const requestedStyle: MovieStyle = parsedExtras.data.style ?? "simple";
  const { canUseAdvancedTheme, PlanGateError } = await import(
    "@/lib/plans/gates"
  );
  try {
    const themeGate = await canUseAdvancedTheme(
      input.userId,
      requestedStyle,
    );
    if (!themeGate.allowed) {
      throw new MovieError(
        themeGate.upgradeHint
          ? `${themeGate.reason} ${themeGate.upgradeHint}`
          : (themeGate.reason ?? "Theme not available on your plan."),
        { retryable: false, code: "plan_limit" },
      );
    }
  } catch (error) {
    if (error instanceof MovieError) throw error;
    if (error instanceof PlanGateError) {
      throw new MovieError(error.message, {
        retryable: false,
        code: "plan_limit",
      });
    }
    throw error;
  }

  const db = getDb();
  const [memory] = await db
    .select({
      id: memories.id,
      userId: memories.userId,
      title: memories.title,
    })
    .from(memories)
    .where(
      and(
        eq(memories.id, input.memoryId),
        eq(memories.userId, input.userId),
      ),
    )
    .limit(1);

  if (!memory) {
    throw new MovieError("Memory not found.", {
      retryable: false,
      code: "not_found",
    });
  }

  const cleanCount = await countCleanMemoryMedia(memory.id, input.userId);
  if (cleanCount === 0) {
    throw new MovieError(
      "No clean media available in this memory. Add clean photos or videos and try again.",
      { retryable: false, code: "validation" },
    );
  }

  const style: MovieStyle = requestedStyle;
  let title: string;
  if (input.autoTitle) {
    const { allocateNextMovieTitle } = await import("@/lib/movies/auto-title");
    title = await allocateNextMovieTitle(input.userId);
  } else {
    title =
      parsedExtras.data.title?.trim() ||
      input.title?.trim() ||
      memory.title ||
      "Family movie";
  }

  const {
    style: _ignoredStyle,
    title: _ignoredTitle,
    ...settingsOnly
  } = parsedExtras.data;
  void _ignoredStyle;
  void _ignoredTitle;

  // Always keep face-aware Ken Burns enabled for Memories + Ask AI creates —
  // quality/filter/transition upgrades must not land as zoom-off / center stills.
  const { ensureFaceAwareMovieSettings } = await import("@/lib/movies/settings");
  const normalized = normalizeMovieSettings(
    ensureFaceAwareMovieSettings(settingsOnly),
  );

  if (normalized.musicUploadKey) {
    const { isMovieMusicKeyForUser } = await import(
      "@/lib/movies/music/upload"
    );
    if (!isMovieMusicKeyForUser(normalized.musicUploadKey, input.userId)) {
      throw new MovieError("Invalid music upload for this account.", {
        retryable: false,
        code: "validation",
      });
    }
  }

  const { movieSettingsRequestMusic, validateMovieMusicSettings } =
    await import("@/lib/movies/settings");
  const musicCheck = validateMovieMusicSettings(normalized);
  if (!musicCheck.ok) {
    throw new MovieError(musicCheck.message, {
      retryable: false,
      code: "validation",
    });
  }
  if (
    movieSettingsRequestMusic(normalized) &&
    normalized.musicSource === "library"
  ) {
    const { getLibraryTrack } = await import("@/lib/movies/music/library");
    const { libraryTrackAbsolutePath } = await import(
      "@/lib/movies/music/resolve"
    );
    const { existsSync } = await import("node:fs");
    const trackId =
      normalized.musicTrackId ||
      normalized.musicSuggestionId ||
      "soft-piano";
    const track = getLibraryTrack(trackId);
    if (!track) {
      if (input.autoTitle || normalized.presetId === "simple_mode") {
        normalized.musicSource = "none";
        normalized.musicTrackId = null;
        normalized.musicSuggestionId = null;
      } else {
        throw new MovieError(`Unknown library music track: ${trackId}`, {
          retryable: false,
          code: "validation",
        });
      }
    } else {
      const abs = libraryTrackAbsolutePath(track);
      if (!existsSync(abs)) {
        if (input.autoTitle || normalized.presetId === "simple_mode") {
          // Simple Mode prefers a silent export over failing create.
          normalized.musicSource = "none";
          normalized.musicTrackId = null;
          normalized.musicSuggestionId = null;
        } else {
          throw new MovieError(
            `Library music file missing on server: ${track.filename}. Deploy public/music/library before creating movies with soundtracks.`,
            { retryable: false, code: "not_found" },
          );
        }
      }
    }
  }

  if (normalized.qualityMode === "ultra") {
    const { getPlanCapabilities } = await import("@/lib/plans/gates");
    const caps = await getPlanCapabilities(input.userId);
    if (!caps.priorityRender) {
      throw new MovieError(
        "Ultra 4K exports require Family Plus or higher. Choose 1080p, or upgrade your plan.",
        { retryable: false, code: "plan_limit" },
      );
    }
  }

  const now = new Date();
  const id = nanoid();

  const [created] = await db
    .insert(movies)
    .values({
      id,
      memoryId: memory.id,
      userId: input.userId,
      title,
      status: "queued",
      style,
      settings: normalized,
      outputKey: null,
      thumbnailKey: null,
      durationSeconds: null,
      errorMessage: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    })
    .returning();

  if (!created) {
    throw new MovieError("Failed to create movie job.");
  }

  try {
    await enqueueJob({
      type: "movie.render",
      payload: {
        movieId: created.id,
        memoryId: created.memoryId,
        userId: created.userId,
        style: created.style,
      },
      maxAttempts: 3,
    });
  } catch (error) {
    const { logMovieFailed } = await import("@/lib/observability/events");
    logMovieFailed(
      {
        movieId: created.id,
        memoryId: created.memoryId,
        userId: created.userId,
        stage: "enqueue",
      },
      error,
    );
    await updateMovieStatus(created.id, "failed", {
      errorMessage:
        "Could not queue movie rendering. Please try again in a moment.",
    }).catch(() => undefined);
    throw new MovieError(
      "Could not queue movie rendering. Please try again.",
      { retryable: false, code: "validation" },
    );
  }

  try {
    await incrementMoviesUsage(created.userId);
  } catch (err) {
    console.warn("[movies] failed to increment usage_records", {
      movieId: created.id,
      userId: created.userId,
      err,
    });
  }

  const { logMovieQueued } = await import("@/lib/observability/events");
  logMovieQueued({
    movieId: created.id,
    memoryId: created.memoryId,
    userId: created.userId,
    style: created.style,
  });

  return created;
}

/**
 * Update movie pipeline status and optional output fields (worker use).
 */
export async function updateMovieStatus(
  movieId: string,
  status: MovieStatus,
  data?: UpdateMovieStatusData,
): Promise<Movie> {
  if (!(MOVIE_STATUSES as readonly string[]).includes(status)) {
    throw new MovieError(
      `Invalid movie status. Use one of: ${MOVIE_STATUSES.join(", ")}.`,
    );
  }

  const parsed = updateStatusSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new MovieError("Invalid movie status update payload.");
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(movies)
    .where(eq(movies.id, movieId))
    .limit(1);

  if (!existing) {
    throw new MovieError("Movie not found.");
  }

  const now = new Date();
  const patch = parsed.data;

  let completedAt = existing.completedAt;
  if (patch.completedAt !== undefined) {
    completedAt = patch.completedAt;
  } else if (status === "ready" || status === "failed") {
    completedAt = now;
  } else if (status === "queued" || status === "processing") {
    completedAt = null;
  }

  const nextSettings =
    patch.settings !== undefined
      ? normalizeMovieSettings({
          ...((existing.settings ?? {}) as MovieSettings),
          ...patch.settings,
        })
      : existing.settings;

  const [updated] = await db
    .update(movies)
    .set({
      status,
      title: patch.title ?? existing.title,
      style: patch.style ?? existing.style,
      settings: nextSettings,
      outputKey:
        patch.outputKey !== undefined ? patch.outputKey : existing.outputKey,
      thumbnailKey:
        patch.thumbnailKey !== undefined
          ? patch.thumbnailKey
          : existing.thumbnailKey,
      durationSeconds:
        patch.durationSeconds !== undefined
          ? patch.durationSeconds
          : existing.durationSeconds,
      errorMessage:
        status === "failed"
          ? (patch.errorMessage ??
            existing.errorMessage ??
            "Movie render failed.")
          : status === "ready"
            ? null
            : patch.errorMessage !== undefined
              ? patch.errorMessage
              : existing.errorMessage,
      completedAt,
      updatedAt: now,
    })
    .where(eq(movies.id, movieId))
    .returning();

  if (!updated) {
    throw new MovieError("Failed to update movie status.");
  }
  return updated;
}

/**
 * Load a movie for its owner (or null when missing / not owned).
 */
export async function getMovie(
  movieId: string,
  userId: string,
): Promise<Movie | null> {
  if (!movieId?.trim() || !userId?.trim()) return null;

  const db = getDb();
  const [row] = await db
    .select()
    .from(movies)
    .where(and(eq(movies.id, movieId), eq(movies.userId, userId)))
    .limit(1);

  return row ?? null;
}

/** @deprecated Import from `@/lib/movies/list` — re-exported for compatibility. */
export {
  listUserMovies,
  listUserMoviesWithMemory,
  type MovieWithMemoryTitle,
} from "@/lib/movies/list";

/**
 * Delete a movie the user owns (DB row + R2 output/thumbnail when present).
 */
export async function deleteMovie(
  movieId: string,
  userId: string,
): Promise<void> {
  if (!movieId?.trim() || !userId?.trim()) {
    throw new MovieError("movieId and userId are required.", {
      retryable: false,
    });
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(movies)
    .where(and(eq(movies.id, movieId), eq(movies.userId, userId)))
    .limit(1);

  if (!existing) {
    throw new MovieError("Movie not found.", {
      retryable: false,
      code: "not_found",
    });
  }

  const { deleteObject } = await import("@/lib/r2");
  const keys = [existing.outputKey, existing.thumbnailKey].filter(
    (key): key is string => Boolean(key?.trim()),
  );

  for (const key of keys) {
    try {
      await deleteObject(key);
    } catch (error) {
      console.warn("[movies] Failed to delete R2 object", key, error);
    }
  }

  await db
    .delete(movies)
    .where(and(eq(movies.id, movieId), eq(movies.userId, userId)));
}
