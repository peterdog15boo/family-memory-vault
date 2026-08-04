import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "account_preferences" jsonb DEFAULT '{}'::jsonb NOT NULL
  `;
  const rows = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'account_preferences'
  `;
  console.log(JSON.stringify({ ok: true, rows }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
