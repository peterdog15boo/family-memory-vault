/**
 * Apply drizzle/0027_document_reminder_kind.sql
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
  const path = "drizzle/0027_document_reminder_kind.sql";
  const contents = readFileSync(path, "utf8");
  const hash = createHash("sha256").update(contents).digest("hex");

  const statements = contents
    .split(";")
    .map((s) => s.replace(/-->\s*statement-breakpoint/g, "").trim())
    .filter(Boolean);

  for (const statement of statements) {
    await sql.query(statement);
    console.log("ok:", statement.slice(0, 72).replace(/\s+/g, " "));
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
      console.log("Recorded migration hash");
    } else {
      console.log("Migration already recorded");
    }
  } catch (error) {
    console.warn("Could not update drizzle journal:", error);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
