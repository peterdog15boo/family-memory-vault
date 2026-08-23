/**
 * Durable public share links for ready movies.
 * Shared pages expose only that movie — never the owner’s library.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { movieShares, movies, type Movie, type MovieShare } from "@/lib/db/schema";
import { getAppUrl } from "@/lib/env";
import { MovieError } from "@/lib/movies/errors";
import { serializeMovie, type SerializedMovie } from "@/lib/movies/serialize";

const SHARE_TOKEN_BYTES = 21;

export function buildMovieSharePageUrl(token: string): string {
  // Stable public page (opaque token — not the internal movie id).
  const url = new URL(
    `/share/movies/${encodeURIComponent(token)}`,
    getAppUrl(),
  );
  return url.toString();
}

/** Legacy path kept for old copied links. */
export function buildLegacyMovieSharePageUrl(token: string): string {
  const url = new URL(`/share/m/${encodeURIComponent(token)}`, getAppUrl());
  return url.toString();
}

function isShareActive(share: MovieShare, now = new Date()): boolean {
  if (share.revokedAt) return false;
  if (share.expiresAt && share.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

/**
 * Create or reuse an active share link for a ready movie the user owns.
 */
export async function ensureMovieShareLink(input: {
  movieId: string;
  userId: string;
}): Promise<{ share: MovieShare; shareUrl: string; created: boolean }> {
  const movieId = input.movieId.trim();
  const userId = input.userId.trim();
  if (!movieId || !userId) {
    throw new MovieError("movieId and userId are required.", {
      retryable: false,
      code: "validation",
    });
  }

  const db = getDb();
  const [movie] = await db
    .select()
    .from(movies)
    .where(and(eq(movies.id, movieId), eq(movies.userId, userId)))
    .limit(1);

  if (!movie) {
    throw new MovieError("Movie not found.", {
      retryable: false,
      code: "not_found",
    });
  }
  if (movie.status !== "ready" || !movie.outputKey?.trim()) {
    throw new MovieError("Movie isn’t ready to share yet.", {
      retryable: false,
      code: "validation",
    });
  }

  const existing = await db
    .select()
    .from(movieShares)
    .where(
      and(
        eq(movieShares.movieId, movieId),
        eq(movieShares.userId, userId),
        isNull(movieShares.revokedAt),
      ),
    )
    .limit(8);

  const active = existing.find((row) => isShareActive(row));
  if (active) {
    return {
      share: active,
      shareUrl: buildMovieSharePageUrl(active.token),
      created: false,
    };
  }

  const now = new Date();
  const [created] = await db
    .insert(movieShares)
    .values({
      id: nanoid(),
      movieId,
      userId,
      token: nanoid(SHARE_TOKEN_BYTES),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!created) {
    throw new MovieError("Could not create a share link.");
  }

  return {
    share: created,
    shareUrl: buildMovieSharePageUrl(created.token),
    created: true,
  };
}

export type PublicSharedMovie = {
  title: string;
  durationSeconds: number | null;
  styleLabel: string;
  playUrl: string | null;
  downloadUrl: string | null;
  thumbnailUrl: string | null;
  urlsExpireAt: string | null;
};

type PublicShareRow = {
  share: MovieShare;
  movie: Movie;
};

/**
 * Look up an active public share without incrementing view count.
 * Used for OG metadata and poster crawls.
 */
export async function lookupPublicMovieShare(
  token: string,
): Promise<PublicShareRow | null> {
  const trimmed = token?.trim();
  if (!trimmed) return null;

  const db = getDb();
  const [row] = await db
    .select({
      share: movieShares,
      movie: movies,
    })
    .from(movieShares)
    .innerJoin(movies, eq(movieShares.movieId, movies.id))
    .where(eq(movieShares.token, trimmed))
    .limit(1);

  if (!row || !isShareActive(row.share)) return null;
  if (row.movie.status !== "ready" || !row.movie.outputKey?.trim()) return null;
  if (row.movie.userId !== row.share.userId) return null;

  return { share: row.share, movie: row.movie as Movie };
}

/** Absolute OG/poster URL Facebook and other crawlers can fetch. */
export function buildMovieSharePosterUrl(token: string): string {
  const url = new URL(
    `/api/public/movies/${encodeURIComponent(token)}/poster`,
    getAppUrl(),
  );
  return url.toString();
}

/**
 * Resolve a public share token to a single ready movie payload.
 * Increments view count. Never returns other library items.
 */
export async function resolvePublicMovieShare(
  token: string,
): Promise<{ movie: PublicSharedMovie; shareUrl: string } | null> {
  const row = await lookupPublicMovieShare(token);
  if (!row) return null;

  const db = getDb();
  void db
    .update(movieShares)
    .set({
      viewCount: sql`${movieShares.viewCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(movieShares.id, row.share.id))
    .catch(() => undefined);

  const serialized = await serializeMovie(row.movie, {
    includeUrls: true,
  });

  return {
    shareUrl: buildMovieSharePageUrl(row.share.token),
    movie: {
      title: serialized.title,
      durationSeconds: serialized.durationSeconds,
      styleLabel: serialized.styleLabel,
      playUrl: serialized.playUrl,
      downloadUrl: serialized.downloadUrl,
      thumbnailUrl: serialized.thumbnailUrl,
      urlsExpireAt: serialized.urlsExpireAt,
    },
  };
}

export async function getActiveShareUrlForMovie(
  movieId: string,
  userId: string,
): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(movieShares)
    .where(
      and(
        eq(movieShares.movieId, movieId),
        eq(movieShares.userId, userId),
        isNull(movieShares.revokedAt),
      ),
    )
    .limit(8);
  const active = rows.find((row) => isShareActive(row));
  return active ? buildMovieSharePageUrl(active.token) : null;
}

/** Attach shareUrl onto a serialized owner movie when an active link exists. */
export async function withMovieShareUrl(
  movie: SerializedMovie,
  userId: string,
): Promise<SerializedMovie> {
  const shareUrl = await getActiveShareUrlForMovie(movie.id, userId);
  return { ...movie, shareUrl };
}
