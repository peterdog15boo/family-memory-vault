import { config } from "dotenv";

config({ path: ".env.local", override: true });
config({ override: true });
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED == null) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

async function main() {
  const userId = process.argv
    .find((a) => a.startsWith("--userId="))
    ?.slice("--userId=".length);
  if (!userId) {
    console.error("Usage: npx tsx scripts/people-stats.ts --userId=<id>");
    process.exit(1);
  }

  const { getDb } = await import("../src/lib/db");
  const { sql } = await import("drizzle-orm");
  const db = getDb();

  const top = await db.execute(sql`
    SELECT p.name, COUNT(f.id)::int AS face_count
    FROM people p
    LEFT JOIN faces f ON f.person_id = p.id
    WHERE p.user_id = ${userId}
    GROUP BY p.id, p.name
    ORDER BY face_count DESC, p.name
    LIMIT 25
  `);

  const summary = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM people WHERE user_id = ${userId}) AS people,
      (SELECT COUNT(*)::int FROM faces WHERE user_id = ${userId}) AS faces,
      (SELECT COUNT(*)::int FROM (
        SELECT person_id FROM faces
        WHERE user_id = ${userId} AND person_id IS NOT NULL
        GROUP BY person_id HAVING COUNT(*) > 1
      ) t) AS people_with_multi_faces
  `);

  console.log("summary", summary.rows ?? summary);
  console.log("top people", top.rows ?? top);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
