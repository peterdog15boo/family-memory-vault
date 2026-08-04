/**
 * Apply drizzle/0013_user_is_admin.sql
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local", override: true });
config({ override: true });

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");

  const sql = neon(url);
  const path = "drizzle/0013_user_is_admin.sql";
  const contents = readFileSync(path, "utf8");
  const hash = createHash("sha256").update(contents).digest("hex");

  await sql.query(contents);
  console.log("Applied:", path);

  try {
    const existing = await sql`
      SELECT hash FROM drizzle.__drizzle_migrations WHERE hash = ${hash}
    `;
    if (existing.length === 0) {
      await sql`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${hash}, ${Date.now()})
      `;
      console.log("Recorded migration hash");
    } else {
      console.log("Migration already recorded");
    }
  } catch (error) {
    console.warn("Could not update drizzle journal:", error);
  }

  const cols = await sql`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'is_admin'
  `;
  console.log(cols);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
