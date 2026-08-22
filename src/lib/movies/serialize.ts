import { and, count, eq, ne, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { Movie } from "@/lib/db/schema";
import { getDb } from "@/lib/db";
import { media, memoryMedia } from "@/lib/db/schema";
import { apiErrorFromUnknown } from "@/lib/http/api-error";
import { resolveMovieTheme } from "@/lib/movies/themes";
import { getMovieDownloadUrl } from "@/lib/r2";

/** Default signed movie URL lifetime (seconds). */
export const MOVIE_SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour — covers pause/seek mid-watch

export type SerializedMovie = {
  id: string;
  memoryId: string;
  memoryTitle?: string | null;
  title: string;
  status: Movie["status"];
  style: Movie["style"];
  /** Human-readable theme label for UI. */
  styleLabel: string;
  settings: Movie["settings"];
  durationSeconds: number | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  /** Signed play URL — only when status is ready. Short-lived. */
  playUrl: string | null;
  /** Same signed URL for download UI. Short-lived. */
  downloadUrl: string | null;
  thumbnailUrl: string | null;
  /** Durable app share page URL when an active share link exists. */
  shareUrl?: string | null;
  /** ISO expiry for play/download URLs when present. */
  urlsExpireAt: string | null;
};

/**
 * Refuse playback URLs when any source media in the memory is no longer
 * clean/ready (e.g. later quarantined). Derivatives must not outlive safety.
 */
async function memoryHasUnsafeSourceMedia(memoryId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ value: count() })
    .from(memoryMedia)
    .innerJoin(media, eq(memoryMedia.mediaId, media.id))
    .where(
      and(
        eq(memoryMedia.memoryId, memoryId),
        or(ne(media.moderationStatus, "clean"), ne(media.status, "ready")),
      ),
    );
  return (row?.value ?? 0) > 0;
}

/**
 * Sign movie output keys for the owner once the render is ready.
 * Uses getMovieDownloadUrl (movies/ prefix + short TTL) — never long-lived public URLs.
 */
export async function serializeMovie(
  movie: Movie & { memoryTitle?: string | null },
  options?: { includeUrls?: boolean },
): Promise<SerializedMovie> {
  const includeUrls = options?.includeUrls !== false;
  let playUrl: string | null = null;
  let downloadUrl: string | null = null;
  let thumbnailUrl: string | null = null;
  let urlsExpireAt: string | null = null;

  const sourcesOk =
    !includeUrls || !(await memoryHasUnsafeSourceMedia(movie.memoryId));

  if (
    includeUrls &&
    sourcesOk &&
    movie.status === "ready" &&
    movie.outputKey?.trim()
  ) {
    try {
      const signed = await getMovieDownloadUrl(
        movie.outputKey,
        movie.userId,
        movie.id,
        MOVIE_SIGNED_URL_TTL_SECONDS,
      );
      playUrl = signed.url;
      downloadUrl = signed.url;
      urlsExpireAt = signed.expiresAt;
    } catch (error) {
      console.error("[movies] Failed to sign movie play URL", movie.id, error);
    }
  }

  if (
    includeUrls &&
    sourcesOk &&
    movie.status === "ready" &&
    movie.thumbnailKey?.trim()
  ) {
    try {
      const signed = await getMovieDownloadUrl(
        movie.thumbnailKey,
        movie.userId,
        movie.id,
        MOVIE_SIGNED_URL_TTL_SECONDS,
      );
      thumbnailUrl = signed.url;
      if (!urlsExpireAt) urlsExpireAt = signed.expiresAt;
    } catch (error) {
      console.error(
        "[movies] Failed to sign movie thumbnail URL",
        movie.id,
        error,
      );
    }
  }

  return {
    id: movie.id,
    memoryId: movie.memoryId,
    memoryTitle: movie.memoryTitle ?? null,
    title: movie.title,
    status: movie.status,
    style: movie.style,
    styleLabel: resolveMovieTheme(movie.style).label,
    settings: movie.settings,
    durationSeconds: movie.durationSeconds,
    errorMessage: movie.errorMessage,
    createdAt: movie.createdAt.toISOString(),
    completedAt: movie.completedAt?.toISOString() ?? null,
    playUrl,
    downloadUrl,
    thumbnailUrl,
    urlsExpireAt,
  };
}

export function movieApiErrorResponse(
  error: unknown,
  fallbackMessage: string,
): NextResponse {
  return apiErrorFromUnknown(error, fallbackMessage);
}
