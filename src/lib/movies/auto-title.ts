/**
 * Sequential "Movie 001" titles per user vault.
 */

import { count, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { movies } from "@/lib/db/schema";
import {
  formatMovieAutoTitle,
  parseMovieAutoTitleSequence,
} from "@/lib/movies/simple-mode";

/**
 * Next unused Movie NNN for this user (based on max existing auto-title).
 */
export async function allocateNextMovieTitle(userId: string): Promise<string> {
  const db = getDb();
  const rows = await db
    .select({ title: movies.title })
    .from(movies)
    .where(eq(movies.userId, userId))
    .orderBy(desc(movies.createdAt))
    .limit(500);

  let maxSeq = 0;
  for (const row of rows) {
    const seq = parseMovieAutoTitleSequence(row.title);
    if (seq != null && seq > maxSeq) maxSeq = seq;
  }

  // Vault has movies but none named Movie NNN — continue from total count.
  if (maxSeq === 0 && rows.length > 0) {
    const [agg] = await db
      .select({ total: count() })
      .from(movies)
      .where(eq(movies.userId, userId));
    maxSeq = Number(agg?.total ?? rows.length);
  }

  return formatMovieAutoTitle(maxSeq + 1);
}
