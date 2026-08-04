/**
 * Count clean photos needing visual analysis.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { and, count, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { media } from "@/lib/db/schema";

async function main() {
  const db = getDb();
  const [clean] = await db
    .select({ value: count() })
    .from(media)
    .where(
      and(
        eq(media.type, "photo"),
        eq(media.status, "ready"),
        eq(media.moderationStatus, "clean"),
      ),
    );

  const [needs] = await db
    .select({ value: count() })
    .from(media)
    .where(
      and(
        eq(media.type, "photo"),
        eq(media.status, "ready"),
        eq(media.moderationStatus, "clean"),
        or(
          isNull(media.visualAnalyzedAt),
          isNull(media.sceneAnalyzedAt),
          eq(media.sceneAnalysisStatus, "failed"),
          eq(media.sceneAnalysisStatus, "pending"),
          isNull(media.sceneAnalysisStatus),
        ),
      ),
    );

  const [withAi] = await db
    .select({ value: count() })
    .from(media)
    .where(
      and(
        eq(media.type, "photo"),
        eq(media.status, "ready"),
        eq(media.moderationStatus, "clean"),
        sql`coalesce(jsonb_array_length(${media.aiTags}), 0) > 0`,
      ),
    );

  console.log(
    JSON.stringify(
      {
        cleanReadyPhotos: Number(clean?.value ?? 0),
        needingVisualAnalysis: Number(needs?.value ?? 0),
        withAiTags: Number(withAi?.value ?? 0),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
