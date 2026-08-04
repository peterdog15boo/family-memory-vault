import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local", override: true });

async function check(name: string, url: string | undefined) {
  if (!url) {
    console.log(name, "missing");
    return;
  }
  const sql = neon(url);
  const cols = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'users'
      AND column_name IN ('is_admin', 'onboarding')
    ORDER BY column_name
  `;
  console.log(
    name,
    cols.map((c) => c.column_name),
  );
}

async function main() {
  await check("pooled", process.env.DATABASE_URL);
  await check("unpooled", process.env.DATABASE_URL_UNPOOLED);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
