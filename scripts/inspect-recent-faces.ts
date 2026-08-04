/**
 * Inspect recent media face assignments for a user.
 * Usage: npx tsx scripts/inspect-recent-faces.ts --userId=<id>
 */

import { config } from "dotenv";

config({ path: ".env.local", override: true });
config({ override: true });
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED == null) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

async function main() {
  const userId = argValue("userId");
  if (!userId) {
    console.error("Need --userId=");
    process.exit(1);
  }

  const { getDb } = await import("../src/lib/db");
  const { sql } = await import("drizzle-orm");
  const db = getDb();

  const recent = await db.execute(sql`
    SELECT
      m.id AS media_id,
      m.original_filename,
      m.created_at,
      COUNT(f.id)::int AS face_count,
      COUNT(DISTINCT f.person_id)::int AS person_count,
      COALESCE(
        json_agg(
          json_build_object(
            'faceId', f.id,
            'personId', f.person_id,
            'personName', p.name,
            'confidence', f.confidence,
            'box', f.bounding_box,
            'faceToken', f.face_token
          )
          ORDER BY (f.bounding_box->>'x')::float
        ) FILTER (WHERE f.id IS NOT NULL),
        '[]'::json
      ) AS faces
    FROM media m
    LEFT JOIN faces f ON f.media_id = m.id
    LEFT JOIN people p ON p.id = f.person_id
    WHERE m.user_id = ${userId}
      AND m.type = 'photo'
    GROUP BY m.id
    ORDER BY m.created_at DESC
    LIMIT 8
  `);

  console.log(JSON.stringify(recent.rows ?? recent, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
