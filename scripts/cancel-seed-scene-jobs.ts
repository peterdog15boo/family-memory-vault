/**
 * Cancel scene jobs for missing seed/demo R2 objects so they stop retrying.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { media, processingJobs } from "@/lib/db/schema";

const SEED_PREFIX = "uploads/user_seed_demo/";

async function main() {
  const db = getDb();
  const seedMedia = await db
    .select({ id: media.id, originalKey: media.originalKey, processedKey: media.processedKey })
    .from(media)
    .where(
      sql`coalesce(${media.processedKey}, ${media.originalKey}, '') like ${SEED_PREFIX + "%"}`,
    );

  const ids = seedMedia.map((m) => m.id);
  console.log("seed/demo media ids", ids);

  if (ids.length === 0) return;

  const updated = await db
    .update(processingJobs)
    .set({
      status: "cancelled",
      lastError:
        "Cancelled: seed/demo media object missing in R2 (NoSuchKey). Expected for demo rows.",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(processingJobs.type, "media.scene"),
        inArray(processingJobs.mediaId, ids),
        inArray(processingJobs.status, ["pending", "processing"]),
      ),
    )
    .returning({ id: processingJobs.id, mediaId: processingJobs.mediaId });

  console.log("cancelled jobs", updated);

  await db
    .update(media)
    .set({
      sceneAnalysisStatus: "failed",
      updatedAt: new Date(),
    })
    .where(inArray(media.id, ids));

  console.log("marked seed media scene_analysis_status=failed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
