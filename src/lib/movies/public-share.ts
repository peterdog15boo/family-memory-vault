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
import { logger } from "@/lib/observability/logger";
import { serializeMovie, type SerializedMovie } from "@/lib/movies/serialize";

const SHARE_TOKEN_BYTES = 21;
const INSERT_ATTEMPTS = 3;

let schemaEnsurePromise: Promise<void> | null = null;

/**
 * Idempotent safety net when migration 0059 was never applied.
 * CREATE IF NOT EXISTS is cheap after the first call (cached per process).
 */
export async function ensureMovieSharesSchema(): Promise<void> {
  if (!schemaEnsurePromise) {
    schemaEnsurePromise = (async () => {
      const db = getDb();
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "movie_shares" (
          "id" text PRIMARY KEY NOT NULL,
          "movie_id" text NOT NULL,
          "user_id" text NOT NULL,
          "token" text NOT NULL,
          "revoked_at" timestamp with time zone,
          "expires_at" timestamp with time zone,
          "view_count" integer DEFAULT 0 NOT NULL,
          "created_at" timestamp with time zone DEFAULT now() NOT NULL,
          "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
      `);
      await db.execute(sql`
        DO $$ BEGIN
          ALTER TABLE "movie_shares" ADD CONSTRAINT "movie_shares_movie_id_movies_id_fk"
            FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id")
            ON DELETE cascade ON UPDATE no action;
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
      `);
      await db.execute(sql`
        DO $$ BEGIN
          ALTER TABLE "movie_shares" ADD CONSTRAINT "movie_shares_user_id_users_id_fk"
            FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
            ON DELETE cascade ON UPDATE no action;
        EXCEPTION WHEN duplicate_object THEN null;
        END $$
      `);
      await db.execute(
        sql`CREATE UNIQUE INDEX IF NOT EXISTS "movie_shares_token_uidx" ON "movie_shares" USING btree ("token")`,
      );
      await db.execute(
        sql`CREATE INDEX IF NOT EXISTS "movie_shares_movie_id_idx" ON "movie_shares" USING btree ("movie_id")`,
      );
      await db.execute(
        sql`CREATE INDEX IF NOT EXISTS "movie_shares_user_id_idx" ON "movie_shares" USING btree ("user_id")`,
      );
    })().catch((error) => {
      schemaEnsurePromise = null;
      throw error;
    });
  }
  await schemaEnsurePromise;
}

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

function pgErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function mapShareDbError(error: unknown, context: string): never {
  const message = error instanceof Error ? error.message : String(error);
  const code = pgErrorCode(error);

  logger.error("movies.share.db_error", {
    context,
    pgCode: code,
    errorName: error instanceof Error ? error.name : "unknown",
    errorMessage: message,
  });

  if (
    code === "42P01" ||
    /relation ["']?movie_shares["']? does not exist/i.test(message)
  ) {
    throw new MovieError(
      "Share storage isn’t ready yet. Please try again in a moment.",
      { retryable: true, code: "validation" },
    );
  }

  if (code === "23503" || /foreign key/i.test(message)) {
    throw new MovieError("Movie not found.", {
      retryable: false,
      code: "not_found",
    });
  }

  throw new MovieError(
    `Could not create share link: ${message.slice(0, 180)}`,
    { retryable: false, code: "validation" },
  );
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

  await ensureMovieSharesSchema();

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

  let existing: MovieShare[];
  try {
    existing = await db
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
  } catch (error) {
    mapShareDbError(error, "list_existing");
  }

  const active = existing.find((row) => isShareActive(row));
  if (active) {
    return {
      share: active,
      shareUrl: buildMovieSharePageUrl(active.token),
      created: false,
    };
  }

  for (let attempt = 1; attempt <= INSERT_ATTEMPTS; attempt++) {
    const now = new Date();
    const id = nanoid();
    const token = nanoid(SHARE_TOKEN_BYTES);

    try {
      await db.insert(movieShares).values({
        id,
        movieId,
        userId,
        token,
        createdAt: now,
        updatedAt: now,
      });

      const [created] = await db
        .select()
        .from(movieShares)
        .where(eq(movieShares.id, id))
        .limit(1);

      if (!created) {
        throw new MovieError("Could not create a share link.", {
          retryable: true,
          code: "validation",
        });
      }

      return {
        share: created,
        shareUrl: buildMovieSharePageUrl(created.token),
        created: true,
      };
    } catch (error) {
      if (error instanceof MovieError) throw error;

      const code = pgErrorCode(error);
      // Unique token collision — rare; retry with a new token.
      if (code === "23505" && attempt < INSERT_ATTEMPTS) {
        logger.warn("movies.share.token_collision", { movieId, attempt });
        continue;
      }

      // Another request may have created a link first — reuse it.
      try {
        const raced = await db
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
        const racedActive = raced.find((row) => isShareActive(row));
        if (racedActive) {
          return {
            share: racedActive,
            shareUrl: buildMovieSharePageUrl(racedActive.token),
            created: false,
          };
        }
      } catch {
        // fall through to mapShareDbError
      }

      mapShareDbError(error, "insert");
    }
  }

  throw new MovieError("Could not create a share link.", {
    retryable: true,
    code: "validation",
  });
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

  try {
    await ensureMovieSharesSchema();
  } catch {
    return null;
  }

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
  try {
    await ensureMovieSharesSchema();
  } catch {
    return null;
  }

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
