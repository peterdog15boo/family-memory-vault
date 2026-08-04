/**
 * Backfill thumbnails for clean/ready media missing thumbnail_key.
 */
import { config } from "dotenv";
import { and, eq, isNull, or } from "drizzle-orm";

config({ path: ".env.local", override: true });
config({ override: true });

if (process.env.ALLOW_INSECURE_TLS === "true") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

async function main() {
  const { getDb } = await import("../src/lib/db");
  const { media } = await import("../src/lib/db/schema");
  const { generateAndStoreThumbnail } = await import(
    "../src/lib/media/thumbnails"
  );

  const db = getDb();
  const rows = await db
    .select({
      id: media.id,
      type: media.type,
      originalFilename: media.originalFilename,
    })
    .from(media)
    .where(
      and(
        eq(media.moderationStatus, "clean"),
        eq(media.status, "ready"),
        or(isNull(media.thumbnailKey), eq(media.thumbnailKey, "")),
      ),
    )
    .limit(50);

  console.log(`Found ${rows.length} clean media missing thumbnails`);

  let ok = 0;
  let fail = 0;
  for (const row of rows) {
    try {
      const result = await generateAndStoreThumbnail(row.id);
      console.log(
        "ok",
        row.id,
        row.type,
        result.skipped ? `skipped:${result.reason}` : result.thumbnailKey,
        result.byteSize,
      );
      ok += 1;
    } catch (error) {
      console.error(
        "fail",
        row.id,
        error instanceof Error ? error.message : error,
      );
      fail += 1;
    }
  }

  console.log(JSON.stringify({ ok, fail, total: rows.length }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
