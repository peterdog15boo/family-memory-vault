/**
 * Read-only movie listing helpers.
 * Kept separate from lifecycle create/update so list pages never depend on
 * the createMovieJob ↔ generator ↔ worker import graph (Webpack circular init).
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { memories, movies, type Movie } from "@/lib/db/schema";

/**
 * List movies for a user (newest first), optionally filtered by memory.
 */
export async function listUserMovies(
  userId: string,
  options?: { memoryId?: string; limit?: number },
): Promise<Movie[]> {
  const limit = Math.min(Math.max(options?.limit ?? 48, 1), 100);
  const db = getDb();

  const rows = await db
    .select()
    .from(movies)
    .where(
      options?.memoryId
        ? and(
            eq(movies.userId, userId),
            eq(movies.memoryId, options.memoryId),
          )
        : eq(movies.userId, userId),
    )
    .orderBy(desc(movies.createdAt))
    .limit(limit);

  return rows;
}

export type MovieWithMemoryTitle = Movie & { memoryTitle: string };

/**
 * List movies with the parent memory title (for library UI).
 * Owner-scoped via movies.userId.
 */
export async function listUserMoviesWithMemory(
  userId: string,
  options?: { memoryId?: string; limit?: number },
): Promise<MovieWithMemoryTitle[]> {
  const limit = Math.min(Math.max(options?.limit ?? 48, 1), 100);
  const db = getDb();

  const rows = await db
    .select({
      movie: movies,
      memoryTitle: memories.title,
    })
    .from(movies)
    .innerJoin(memories, eq(movies.memoryId, memories.id))
    .where(
      options?.memoryId
        ? and(
            eq(movies.userId, userId),
            eq(movies.memoryId, options.memoryId),
          )
        : eq(movies.userId, userId),
    )
    .orderBy(desc(movies.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row.movie,
    memoryTitle: row.memoryTitle,
  }));
}
