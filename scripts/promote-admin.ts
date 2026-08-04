/**
 * Promote (or demote) a user to platform admin via users.is_admin.
 *
 * Usage:
 *   npx tsx scripts/promote-admin.ts --email=you@example.com
 *   npx tsx scripts/promote-admin.ts --userId=user_xxx
 *   npx tsx scripts/promote-admin.ts --email=you@example.com --demote
 *
 * Requires DATABASE_URL. User must already exist (sign in once first).
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local", override: true });
config({ override: true });

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--")) {
    return process.argv[idx + 1];
  }
  return undefined;
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const userId = arg("userId")?.trim();
  const demote = process.argv.includes("--demote");
  const nextFlag = !demote;

  if (!email && !userId) {
    console.error(
      "Usage: npx tsx scripts/promote-admin.ts --email=you@example.com\n" +
        "   or: npx tsx scripts/promote-admin.ts --userId=user_xxx\n" +
        "Optional: --demote",
    );
    process.exit(1);
  }

  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL missing");

  const sql = neon(url);

  if (userId) {
    const rows = await sql`
      UPDATE users
      SET is_admin = ${nextFlag}, updated_at = NOW()
      WHERE id = ${userId}
      RETURNING id, email, is_admin
    `;
    if (rows.length === 0) {
      console.error(`No user with id ${userId}. Sign in once first.`);
      process.exit(1);
    }
    console.log(nextFlag ? "Promoted:" : "Demoted:", rows[0]);
    return;
  }

  const rows = await sql`
    UPDATE users
    SET is_admin = ${nextFlag}, updated_at = NOW()
    WHERE lower(email) = ${email!}
    RETURNING id, email, is_admin
  `;
  if (rows.length === 0) {
    console.error(`No user with email ${email}. Sign in once first.`);
    process.exit(1);
  }
  console.log(nextFlag ? "Promoted:" : "Demoted:", rows[0]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
