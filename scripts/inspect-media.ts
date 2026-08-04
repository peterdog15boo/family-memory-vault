import { config } from "dotenv";

config({ path: ".env.local", override: true });
config({ override: true });
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED == null) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

async function main() {
  const userId = "user_3Gz1AUz6ZBfCeUiNvgztr70cmb7";
  const { getDb } = await import("../src/lib/db");
  const { sql } = await import("drizzle-orm");
  const { getSafeMediaForUser } = await import("../src/lib/media/queries");
  const db = getDb();

  const all = await db.execute(sql`
    SELECT
      id,
      original_filename,
      status,
      moderation_status,
      created_at,
      (thumbnail_key IS NOT NULL) AS has_thumb,
      (SELECT COUNT(*)::int FROM faces f WHERE f.media_id = m.id) AS face_count
    FROM media m
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 30
  `);

  console.log("all media (top 30):");
  console.log(JSON.stringify(all.rows ?? all, null, 2));

  const safe = await getSafeMediaForUser(userId, 20);
  console.log(
    "\nsafe media for dashboard:",
    safe.map((s) => ({
      id: s.id,
      name: s.originalFilename,
      preview: Boolean(s.previewUrl),
    })),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
