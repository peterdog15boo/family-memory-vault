import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { media } from "@/lib/db/schema";

async function main() {
  const db = getDb();
  const rows = await db
    .select({
      caption: media.aiCaption,
      tags: media.aiTags,
      objects: media.aiObjects,
    })
    .from(media)
    .where(
      and(
        eq(media.moderationStatus, "clean"),
        sql`${media.aiTags}::text ilike ${"%inflatable%"}`,
      ),
    )
    .limit(10);

  console.log(`inflatable-tagged photos: ${rows.length}`);
  for (const row of rows) {
    console.log("-", row.caption);
    console.log("  tags:", (row.tags ?? []).slice(0, 10).join(", "));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
