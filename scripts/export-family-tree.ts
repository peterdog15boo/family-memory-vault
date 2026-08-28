/**
 * Export a family's Family Tree as debug JSON.
 *
 * Usage:
 *   npm run export:family-tree -- --familyId=fam_xxx
 *   npm run export:family-tree -- --userId=user_xxx
 *   npm run export:family-tree -- --familyId=fam_xxx --out=./scott-tree.json
 *   npm run export:family-tree -- --familyId=fam_xxx --includeRepair
 *
 * Prefer --familyId. --userId resolves the creator's first family.
 * Requires DATABASE_URL (.env.local). No emails or secrets in the file.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: ".env.local", override: true });
config({ override: true });

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (
    idx >= 0 &&
    process.argv[idx + 1] &&
    !process.argv[idx + 1]!.startsWith("--")
  ) {
    return process.argv[idx + 1];
  }
  return undefined;
}

async function resolveScope(
  userId: string | undefined,
  familyId: string | undefined,
): Promise<{ familyId: string; peopleOwnerId: string }> {
  const { getDb } = await import("@/lib/db");
  const { families } = await import("@/lib/db/schema");
  const db = getDb();

  if (familyId) {
    const [row] = await db
      .select({
        id: families.id,
        createdByUserId: families.createdByUserId,
      })
      .from(families)
      .where(eq(families.id, familyId))
      .limit(1);
    if (!row) {
      throw new Error(`Family not found: ${familyId}`);
    }
    return { familyId: row.id, peopleOwnerId: row.createdByUserId };
  }

  if (!userId) {
    throw new Error("Provide --userId=… or --familyId=…");
  }

  const [row] = await db
    .select({
      id: families.id,
      createdByUserId: families.createdByUserId,
    })
    .from(families)
    .where(eq(families.createdByUserId, userId))
    .limit(1);
  if (!row) {
    throw new Error(`No family found for user: ${userId}`);
  }
  return { familyId: row.id, peopleOwnerId: row.createdByUserId };
}

async function main() {
  const userIdArg = arg("userId")?.trim();
  const familyId = arg("familyId")?.trim();
  const out = arg("out")?.trim();
  const includeRepair = process.argv.includes("--includeRepair");

  if (!userIdArg && !familyId) {
    console.error(
      "Usage: npm run export:family-tree -- --userId=user_xxx | --familyId=fam_xxx [--out=path.json] [--includeRepair]",
    );
    process.exit(1);
  }

  if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
    throw new Error("DATABASE_URL missing");
  }

  const scope = await resolveScope(userIdArg, familyId);
  const { buildFamilyTreeDebugExport, familyTreeDebugFilename } = await import(
    "@/lib/family-tree/debug-export"
  );

  const payload = await buildFamilyTreeDebugExport(scope, {
    skipRepair: !includeRepair,
  });
  const json = `${JSON.stringify(payload, null, 2)}\n`;

  if (out) {
    const path = resolve(out);
    writeFileSync(path, json, "utf8");
    console.error(`Wrote ${path}`);
    console.error(
      `familyId=${scope.familyId} peopleOwner=${scope.peopleOwnerId} nodes=${payload.meta.nodeCount} relationships=${payload.meta.relationshipCount}`,
    );
  } else {
    const suggested = familyTreeDebugFilename(scope);
    console.error(`# familyId=${scope.familyId} peopleOwner=${scope.peopleOwnerId}`);
    console.error(`# Suggested filename: ${suggested}`);
    process.stdout.write(json);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
