/**
 * Apply drizzle/0050_user_location_sharing.sql (statement-by-statement).
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
  const path = "drizzle/0050_user_location_sharing.sql";
  const contents = readFileSync(path, "utf8");
  const hash = createHash("sha256").update(contents).digest("hex");

  const statements = contents
    .split(/-->\s*statement-breakpoint/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/;\s*$/, ""));

  for (const statement of statements) {
    await sql.query(statement);
    console.log("ok:", statement.slice(0, 90).replace(/\s+/g, " "));
  }

  try {
    const existing = await sql`
      SELECT hash FROM drizzle.__drizzle_migrations WHERE hash = ${hash}
    `;
    if (existing.length === 0) {
      await sql`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${hash}, ${Date.now()})
      `;
      console.log("recorded migration hash");
    } else {
      console.log("migration hash already recorded");
    }
  } catch (error) {
    console.warn("could not record drizzle migration hash", error);
  }

  console.log("done");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
