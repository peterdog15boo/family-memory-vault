/**
 * First Family Movie — start a Simple Mode render from ritual photos.
 * Fast-path: shorter film, capped clip count, allowFastQuality encode.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { createMemory } from "@/lib/memories";
import { FFM_SOFT_MIN_PHOTOS } from "@/lib/first-family-movie/guided-upload";
import { isFirstFamilyMovieOnboardingEnabled } from "@/lib/first-family-movie/flags";
import { createMovieJob } from "@/lib/movies/lifecycle";
import { serializeMovie, type SerializedMovie } from "@/lib/movies/serialize";
import { buildSimpleModeSettings } from "@/lib/movies/simple-mode";
import type { MovieSettings } from "@/lib/movies/settings";

/** Cap clips so the first reveal arrives sooner. */
export const FFM_FAST_MAX_PHOTOS = 10;

/**
 * Scale Simple Mode pacing for a snappy 24–42s first short film.
 */
export function firstFamilyMovieDurationSettings(
  photoCount: number,
): Pick<MovieSettings, "targetDurationSeconds" | "photoDurationMs"> {
  const n = Math.max(5, Math.min(FFM_FAST_MAX_PHOTOS, Math.floor(photoCount)));
  const targetDurationSeconds = Math.round(
    Math.min(42, Math.max(24, 14 + n * 2.8)),
  );
  const photoDurationMs = Math.round(
    Math.min(4200, Math.max(2200, (targetDurationSeconds * 1000) / n + 200)),
  );
  return { targetDurationSeconds, photoDurationMs };
}

/**
 * Lightweight Simple Mode settings for the first-session ritual.
 * Still polished (soft dissolves + face-aware motion) with a faster encode.
 */
export function buildFirstFamilyMovieSettings(
  photoCount: number,
): MovieSettings {
  const duration = firstFamilyMovieDurationSettings(photoCount);
  return {
    ...buildSimpleModeSettings(),
    ...duration,
    includeTitles: false,
    posterStyle: "photo",
    qualityMode: "fast",
    transitionDurationMs: 700,
    transition: "soft_dissolve",
  };
}

export type FirstFamilyMovieCreateResult =
  | {
      phase: "awaiting_media";
      cleanCount: number;
      total: number;
      needed: number;
    }
  | {
      phase: "rendering";
      memoryId: string;
      movie: SerializedMovie;
    };

/**
 * Ensure owned media are clean/ready, create a memory, queue Simple Mode movie.
 */
export async function startFirstFamilyMovieCreate(input: {
  userId: string;
  mediaIds: string[];
}): Promise<FirstFamilyMovieCreateResult> {
  if (!isFirstFamilyMovieOnboardingEnabled()) {
    throw new FirstFamilyMovieCreateError(
      "First Family Movie onboarding is turned off.",
      "flag_off",
    );
  }

  const uniqueIds = [
    ...new Set(input.mediaIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (uniqueIds.length < FFM_SOFT_MIN_PHOTOS) {
    throw new FirstFamilyMovieCreateError(
      `Add at least ${FFM_SOFT_MIN_PHOTOS} photos first.`,
      "validation",
    );
  }
  if (uniqueIds.length > 60) {
    throw new FirstFamilyMovieCreateError(
      "Too many photos for this first movie — pick your favorites.",
      "validation",
    );
  }

  const db = getDb();
  const rows = await db
    .select({
      id: media.id,
      status: media.status,
      moderationStatus: media.moderationStatus,
      type: media.type,
    })
    .from(media)
    .where(and(eq(media.userId, input.userId), inArray(media.id, uniqueIds)));

  if (rows.length !== uniqueIds.length) {
    throw new FirstFamilyMovieCreateError(
      "Some photos could not be found in your vault.",
      "validation",
    );
  }

  // Preserve upload order from the client list.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const cleanOrdered = uniqueIds.filter((id) => {
    const r = byId.get(id);
    return (
      r &&
      r.moderationStatus === "clean" &&
      r.status === "ready" &&
      r.type === "photo"
    );
  });

  if (cleanOrdered.length < FFM_SOFT_MIN_PHOTOS) {
    return {
      phase: "awaiting_media",
      cleanCount: cleanOrdered.length,
      total: uniqueIds.length,
      needed: FFM_SOFT_MIN_PHOTOS,
    };
  }

  const mediaIdsForMovie = cleanOrdered.slice(0, FFM_FAST_MAX_PHOTOS);

  const memory = await createMemory({
    userId: input.userId,
    title: "My First Family Movie",
    description: "Created during your first session.",
    type: "album",
    coverMediaId: mediaIdsForMovie[0] ?? null,
    mediaIds: mediaIdsForMovie,
  });

  const settings = buildFirstFamilyMovieSettings(mediaIdsForMovie.length);
  const created = await createMovieJob({
    memoryId: memory.id,
    userId: input.userId,
    autoTitle: true,
    style: "simple",
    settings,
    allowFastQuality: true,
  });

  const movie = await serializeMovie(created, { includeUrls: false });

  return {
    phase: "rendering",
    memoryId: memory.id,
    movie,
  };
}

export class FirstFamilyMovieCreateError extends Error {
  readonly code: "flag_off" | "validation" | "plan_limit" | "unknown";

  constructor(
    message: string,
    code: FirstFamilyMovieCreateError["code"] = "unknown",
  ) {
    super(message);
    this.name = "FirstFamilyMovieCreateError";
    this.code = code;
  }
}
