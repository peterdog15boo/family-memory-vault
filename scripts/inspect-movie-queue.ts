import { config } from "dotenv";
config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");
  const sql = neon(url);

  const jobs = await sql`
    SELECT id, type, status, attempts, max_attempts, last_error,
           created_at, started_at, payload->>'movieId' AS movie_id
    FROM processing_jobs
    WHERE type = 'movie.render'
    ORDER BY created_at DESC
    LIMIT 10
  `;
  console.log("jobs:", JSON.stringify(jobs, null, 2));

  const movies = await sql`
    SELECT id, title, status, error_message, created_at, completed_at
    FROM movies
    ORDER BY created_at DESC
    LIMIT 10
  `;
  console.log("movies:", JSON.stringify(movies, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
