/**
 * Apply drizzle/0054_linked_account_categories.sql and backfill from Plaid type/subtype.
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
  const path = "drizzle/0054_linked_account_categories.sql";
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

  // Best-effort backfill for existing rows (mirrors categorizePlaidAccount rules).
  await sql.query(`
    UPDATE linked_accounts SET category = 'insurance_benefits'
    WHERE category_manual = false
      AND lower(coalesce(subtype, '')) IN (
        'hsa', 'fsa', 'health reimbursement arrangement',
        'life insurance', 'other insurance', 'disability', 'insurance'
      )
  `);
  await sql.query(`
    UPDATE linked_accounts SET category = 'credit_cards'
    WHERE category_manual = false
      AND (
        lower(type) = 'credit'
        OR lower(coalesce(subtype, '')) IN ('credit card', 'credit')
      )
  `);
  await sql.query(`
    UPDATE linked_accounts SET category = 'loans_debt'
    WHERE category_manual = false
      AND lower(type) = 'loan'
  `);
  await sql.query(`
    UPDATE linked_accounts SET category = 'investments'
    WHERE category_manual = false
      AND lower(type) = 'investment'
      AND lower(coalesce(subtype, '')) NOT IN ('other insurance', 'life insurance')
  `);
  await sql.query(`
    UPDATE linked_accounts SET category = 'banking'
    WHERE category_manual = false
      AND lower(type) = 'depository'
      AND lower(coalesce(subtype, '')) IN (
        '', 'other', 'checking', 'savings', 'money market', 'cd',
        'certificate of deposit', 'cash management', 'prepaid', 'paypal', 'ebt'
      )
  `);

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
