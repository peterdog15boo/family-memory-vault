import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    ALTER TABLE "people"
    ADD COLUMN IF NOT EXISTS "avatar_focus_x" double precision
  `;
  await sql`
    ALTER TABLE "people"
    ADD COLUMN IF NOT EXISTS "avatar_focus_y" double precision
  `;
  await sql`
    ALTER TABLE "people"
    ADD COLUMN IF NOT EXISTS "avatar_zoom" double precision
  `;
  const rows = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'people'
      AND column_name IN ('avatar_focus_x', 'avatar_focus_y', 'avatar_zoom')
    ORDER BY column_name
  `;
  console.log(JSON.stringify({ ok: true, rows }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
