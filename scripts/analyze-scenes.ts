/**
 * Enqueue (or run) visual/scene analysis for existing clean/ready media.
 *
 * Usage:
 *   npx tsx scripts/analyze-scenes.ts
 *   npx tsx scripts/analyze-scenes.ts --limit 50
 *   npx tsx scripts/analyze-scenes.ts --run   # analyze inline instead of enqueue
 *   npx tsx scripts/analyze-scenes.ts --force
 *   npx tsx scripts/analyze-scenes.ts --sparse --run --limit 100
 *   npx tsx scripts/analyze-scenes.ts --media <mediaId> --run --force
 *   npx tsx scripts/analyze-scenes.ts --include-videos --run --limit 20
 *   npx tsx scripts/analyze-scenes.ts --videos-only --run --limit 20
 *
 * Prefer OpenAI vision when OPENAI_API_KEY is set; otherwise Rekognition labels.
 * Videos sample a few frames via ffmpeg (see VIDEO_ANALYSIS_MAX_FRAMES).
 * Default selection prioritizes items missing useful ai_tags / ai_scenes.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { media } from "@/lib/db/schema";
import {
  analyzeAndStoreSceneForMedia,
  maybeEnqueueSceneAnalysisForMedia,
} from "@/lib/media/scene";

function parseArgs(argv: string[]) {
  const limitIdx = argv.indexOf("--limit");
  const mediaIdx = argv.indexOf("--media");
  const limit =
    limitIdx >= 0 ? Math.max(1, Number(argv[limitIdx + 1]) || 100) : 100;
  const mediaId =
    mediaIdx >= 0 && argv[mediaIdx + 1] ? String(argv[mediaIdx + 1]) : null;
  const videosOnly = argv.includes("--videos-only");
  const includeVideos =
    videosOnly || argv.includes("--include-videos") || argv.includes("--videos");
  return {
    limit,
    mediaId,
    run: argv.includes("--run"),
    force: argv.includes("--force"),
    includeVideos,
    videosOnly,
    /** Prefer rows with empty/sparse AI labels (default when not --force). */
    sparse: argv.includes("--sparse") || !argv.includes("--force"),
  };
}

/** Rank sparse / missing label rows first for backfill. */
const sparsePrioritySql = sql`
  case
    when ${media.aiTags} is null
      or coalesce(jsonb_array_length(${media.aiTags}), 0) = 0 then 0
    when ${media.aiScenes} is null
      or coalesce(jsonb_array_length(${media.aiScenes}), 0) = 0 then 1
    when coalesce(jsonb_array_length(${media.aiTags}), 0) < 3 then 2
    when ${media.visualAnalyzedAt} is null then 3
    else 4
  end
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = getDb();

  const types = args.videosOnly
    ? (["video"] as const)
    : args.includeVideos
      ? (["photo", "video"] as const)
      : (["photo"] as const);

  const rows = args.mediaId
    ? await db
        .select()
        .from(media)
        .where(eq(media.id, args.mediaId))
        .limit(1)
    : await db
        .select()
        .from(media)
        .where(
          and(
            inArray(media.type, [...types]),
            eq(media.status, "ready"),
            eq(media.moderationStatus, "clean"),
            args.force
              ? sql`true`
              : or(
                  isNull(media.sceneAnalyzedAt),
                  isNull(media.visualAnalyzedAt),
                  eq(media.sceneAnalysisStatus, "failed"),
                  eq(media.sceneAnalysisStatus, "pending"),
                  isNull(media.sceneAnalysisStatus),
                  // Sparse labels: analyzed but not useful for common searches
                  sql`coalesce(jsonb_array_length(${media.aiTags}), 0) < 3`,
                  sql`${media.aiScenes} is null or coalesce(jsonb_array_length(${media.aiScenes}), 0) = 0`,
                ),
          ),
        )
        .orderBy(
          args.sparse ? asc(sparsePrioritySql) : asc(media.createdAt),
          asc(media.createdAt),
        )
        .limit(args.limit);

  console.info(`[analyze-scenes] Found ${rows.length} item(s)`, {
    ...args,
    types: [...types],
    note: args.sparse
      ? "prioritizing missing/sparse ai_tags & ai_scenes"
      : "createdAt order",
  });

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      if (args.run) {
        const result = await analyzeAndStoreSceneForMedia(row.id, {
          // Only force when explicitly requested (or single-media target).
          force: args.force || Boolean(args.mediaId),
        });
        if (result.skipped) {
          skipped += 1;
          console.info("skip", row.id, row.type, result.skipReason);
        } else {
          ok += 1;
          console.info(
            "ok",
            row.id,
            row.type,
            result.frameCount != null ? `frames=${result.frameCount}` : "",
            result.result?.provider,
            result.result?.caption,
            result.result?.tags.slice(0, 8),
            result.result?.objects.slice(0, 6),
            result.result?.scenes.slice(0, 4),
          );
        }
      } else {
        const job = await maybeEnqueueSceneAnalysisForMedia(row, {
          force: args.force || Boolean(args.mediaId),
          source: "scripts.analyze-scenes",
        });
        if (job) {
          ok += 1;
          console.info("enqueued", row.id, row.type, job.id);
        } else {
          skipped += 1;
          console.info("skip", row.id, row.type);
        }
      }
    } catch (error) {
      failed += 1;
      console.error(
        "fail",
        row.id,
        row.type,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.info(`[analyze-scenes] done`, { ok, skipped, failed });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
