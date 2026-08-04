/**
 * Apply drizzle/0009_plans_subscriptions.sql when drizzle-kit migrate exits silently.
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
  const path = "drizzle/0009_plans_subscriptions.sql";
  const contents = readFileSync(path, "utf8");
  const hash = createHash("sha256").update(contents).digest("hex");

  const existing = await sql`
    SELECT hash FROM drizzle.__drizzle_migrations WHERE hash = ${hash}
  `;
  if (existing.length > 0) {
    console.log("Migration 0009 already recorded.");
  }

  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('plans', 'subscriptions', 'usage_records')
    ORDER BY table_name
  `;
  console.log(
    "existing plan tables:",
    tables.map((t) => t.table_name),
  );

  if (tables.length < 3) {
    const statements = contents
      .split(/-->\s*statement-breakpoint/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      console.log("exec:", statement.slice(0, 72).replace(/\s+/g, " ") + "…");
      await sql.query(statement);
    }
    console.log("Applied 0009 SQL statements.");
  } else {
    console.log("Tables already present; skipping DDL.");
  }

  if (existing.length === 0) {
    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${hash}, ${Date.now()})
    `;
    console.log("Recorded migration hash:", hash.slice(0, 12));
  }

  const verify = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('plans', 'subscriptions', 'usage_records')
    ORDER BY table_name
  `;
  console.log(
    "verify tables:",
    verify.map((t) => t.table_name),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
