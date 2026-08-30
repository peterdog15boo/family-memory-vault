require("dotenv").config({ path: ".env.local" });
const { neon } = require("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL);
(async () => {
  try {
    const r = await sql`SELECT to_regclass('public.movie_shares') AS table_name`;
    console.log("movie_shares:", JSON.stringify(r));
    const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'movie_shares' ORDER BY ordinal_position`;
    console.log("columns:", JSON.stringify(cols));
  } catch (e) {
    console.error("ERR", e.message || e);
  }
})();
