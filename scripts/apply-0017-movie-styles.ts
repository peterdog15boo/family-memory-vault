/**
 * Apply drizzle/0017_movie_styles_vintage_bright.sql
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

  // Local Windows TLS interceptors — match prior apply scripts / workers.
  if (process.env.ALLOW_INSECURE_TLS === "true") {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  const sql = neon(url);
  const path = "drizzle/0017_movie_styles_vintage_bright.sql";
  const contents = readFileSync(path, "utf8");
  const hash = createHash("sha256").update(contents).digest("hex");

  for (const statement of contents
    .split(/-->\s*statement-breakpoint|;/)
    .map((s) => s.trim())
    .filter(Boolean)) {
    console.log("running:", statement.replace(/\s+/g, " ").slice(0, 100));
    await sql.query(statement);
    console.log("ok");
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

  const styles = await sql`
    SELECT enumlabel
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'movie_style'
    ORDER BY enumsortorder
  `;
  console.log(
    "movie_style values:",
    styles.map((r) => r.enumlabel).join(", "),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
