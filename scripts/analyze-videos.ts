/**
 * Backfill sampled-frame face + scene/object analysis for clean/ready videos.
 *
 * Usage:
 *   npx tsx scripts/analyze-videos.ts
 *   npx tsx scripts/analyze-videos.ts --limit 50
 *   npx tsx scripts/analyze-videos.ts --run              # analyze inline
 *   npx tsx scripts/analyze-videos.ts --force
 *   npx tsx scripts/analyze-videos.ts --media <mediaId> --run --force
 *   npx tsx scripts/analyze-videos.ts --scenes-only
 *   npx tsx scripts/analyze-videos.ts --faces-only
 *   npx tsx scripts/analyze-videos.ts --drain 20         # enqueue then drain workers
 *
 * Default: enqueue both media.scene and face.detect for videos missing
 * visual_analyzed_at (or failed scene status). Seed/demo keys and missing R2
 * objects are skipped (not enqueued).
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED == null) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

import { and, asc, eq, exists, isNull, not, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { faces, media, type Media } from "@/lib/db/schema";
import {
  maybeEnqueueFaceDetectionForMedia,
  processFacesForMedia,
} from "@/lib/faces/pipeline";
import {
  analyzeAndStoreSceneForMedia,
  maybeEnqueueSceneAnalysisForMedia,
} from "@/lib/media/scene";
import { headObjectMeta } from "@/lib/r2";

const LOG = "[analyze-videos]";
const SEED_KEY_PREFIXES = ["uploads/user_seed_demo/"] as const;

function parseArgs(argv: string[]) {
  const limitIdx = argv.indexOf("--limit");
  const mediaIdx = argv.indexOf("--media");
  const drainIdx = argv.indexOf("--drain");
  const limit =
    limitIdx >= 0 ? Math.max(1, Number(argv[limitIdx + 1]) || 100) : 100;
  const mediaId =
    mediaIdx >= 0 && argv[mediaIdx + 1] ? String(argv[mediaIdx + 1]) : null;
  const drainRaw =
    drainIdx >= 0 ? Number(argv[drainIdx + 1] ?? 20) : null;
  const drain =
    drainRaw != null && Number.isFinite(drainRaw)
      ? Math.min(200, Math.max(1, Math.floor(drainRaw)))
      : null;

  const facesOnly = argv.includes("--faces-only");
  const scenesOnly = argv.includes("--scenes-only");
  if (facesOnly && scenesOnly) {
    throw new Error("Use only one of --faces-only or --scenes-only.");
  }

  return {
    limit,
    mediaId,
    run: argv.includes("--run"),
    force: argv.includes("--force"),
    drain,
    doScenes: !facesOnly,
    doFaces: !scenesOnly,
    /** Skip R2 HEAD (faster enqueue; workers may still fail on missing keys). */
    skipR2Check: argv.includes("--skip-r2-check"),
  };
}

function isSeedOrDemoKey(key: string | null | undefined): boolean {
  if (!key?.trim()) return false;
  return SEED_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function isSeedOrDemoMedia(
  row: Pick<Media, "originalKey" | "processedKey" | "thumbnailKey" | "userId">,
): boolean {
  if (row.userId?.includes("seed") || row.userId?.includes("demo")) {
    return true;
  }
  return (
    isSeedOrDemoKey(row.originalKey) ||
    isSeedOrDemoKey(row.processedKey) ||
    isSeedOrDemoKey(row.thumbnailKey)
  );
}

function videoSourceKey(
  row: Pick<Media, "originalKey" | "processedKey">,
): string {
  return row.originalKey || row.processedKey || "";
}

async function objectExistsInR2(key: string): Promise<boolean> {
  if (!key.trim()) return false;
  try {
    const meta = await headObjectMeta(key);
    return Boolean(meta && meta.contentLength > 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/NoSuchKey|NotFound|404/i.test(message)) return false;
    // Treat unexpected HEAD errors as missing so we don't spam the queue.
    console.warn(`${LOG} R2 HEAD failed — treating as missing`, {
      key,
      error: message.slice(0, 160),
    });
    return false;
  }
}

type Counts = {
  found: number;
  skippedSeed: number;
  skippedMissingR2: number;
  sceneEnqueued: number;
  faceEnqueued: number;
  sceneOk: number;
  faceOk: number;
  sceneSkipped: number;
  faceSkipped: number;
  sceneFailed: number;
  faceFailed: number;
  drainedScene: number;
  drainedFace: number;
  drainFailures: number;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = getDb();

  const needsSceneSql = args.force
    ? sql`true`
    : or(
        isNull(media.visualAnalyzedAt),
        isNull(media.sceneAnalyzedAt),
        eq(media.sceneAnalysisStatus, "failed"),
        eq(media.sceneAnalysisStatus, "pending"),
        isNull(media.sceneAnalysisStatus),
        sql`coalesce(jsonb_array_length(${media.aiTags}), 0) = 0`,
      );

  const needsFacesSql = args.force
    ? sql`true`
    : not(
        exists(
          db
            .select({ id: faces.id })
            .from(faces)
            .where(
              and(eq(faces.mediaId, media.id), eq(faces.userId, media.userId)),
            ),
        ),
      );

  const needsWorkSql =
    args.doScenes && args.doFaces
      ? or(needsSceneSql, needsFacesSql)
      : args.doScenes
        ? needsSceneSql
        : needsFacesSql;

  const rows = args.mediaId
    ? await db
        .select()
        .from(media)
        .where(and(eq(media.id, args.mediaId), eq(media.type, "video")))
        .limit(1)
    : await db
        .select()
        .from(media)
        .where(
          and(
            eq(media.type, "video"),
            eq(media.status, "ready"),
            eq(media.moderationStatus, "clean"),
            needsWorkSql,
          ),
        )
        .orderBy(asc(media.createdAt))
        .limit(args.limit);

  const counts: Counts = {
    found: rows.length,
    skippedSeed: 0,
    skippedMissingR2: 0,
    sceneEnqueued: 0,
    faceEnqueued: 0,
    sceneOk: 0,
    faceOk: 0,
    sceneSkipped: 0,
    faceSkipped: 0,
    sceneFailed: 0,
    faceFailed: 0,
    drainedScene: 0,
    drainedFace: 0,
    drainFailures: 0,
  };

  console.info(`${LOG} candidates`, {
    found: rows.length,
    ...args,
    note: "clean/ready videos needing visual and/or face analysis",
  });

  for (const row of rows) {
    if (isSeedOrDemoMedia(row)) {
      counts.skippedSeed += 1;
      console.info(`${LOG} skip seed/demo`, {
        mediaId: row.id,
        key: videoSourceKey(row),
      });
      continue;
    }

    const key = videoSourceKey(row);
    if (!key) {
      counts.skippedMissingR2 += 1;
      console.info(`${LOG} skip missing source key`, { mediaId: row.id });
      continue;
    }

    if (!args.skipR2Check) {
      const existsInR2 = await objectExistsInR2(key);
      if (!existsInR2) {
        counts.skippedMissingR2 += 1;
        console.info(`${LOG} skip missing R2 object`, {
          mediaId: row.id,
          key,
        });
        continue;
      }
    }

    if (args.doScenes) {
      try {
        if (args.run) {
          const result = await analyzeAndStoreSceneForMedia(row.id, {
            force: args.force || Boolean(args.mediaId),
          });
          if (result.skipped) {
            counts.sceneSkipped += 1;
            console.info(`${LOG} scene skip`, row.id, result.skipReason);
          } else {
            counts.sceneOk += 1;
            console.info(`${LOG} scene ok`, {
              mediaId: row.id,
              frames: result.frameCount,
              tags: result.result?.tags.slice(0, 8),
              provider: result.result?.provider,
            });
          }
        } else {
          const job = await maybeEnqueueSceneAnalysisForMedia(row, {
            force: args.force || Boolean(args.mediaId),
            source: "scripts.analyze-videos",
          });
          if (job) {
            counts.sceneEnqueued += 1;
            console.info(`${LOG} scene enqueued`, row.id, job.id);
          } else {
            counts.sceneSkipped += 1;
            console.info(`${LOG} scene enqueue skipped`, row.id);
          }
        }
      } catch (error) {
        counts.sceneFailed += 1;
        console.error(
          `${LOG} scene fail`,
          row.id,
          error instanceof Error ? error.message : error,
        );
      }
    }

    if (args.doFaces) {
      try {
        if (args.run) {
          const outcome = await processFacesForMedia(row.id, {
            userId: row.userId,
            replaceExisting: args.force || Boolean(args.mediaId),
          });
          if (outcome.detection.skipped) {
            counts.faceSkipped += 1;
            console.info(
              `${LOG} faces skip`,
              row.id,
              outcome.detection.skipReason,
            );
          } else {
            counts.faceOk += 1;
            console.info(`${LOG} faces ok`, {
              mediaId: row.id,
              stored: outcome.detection.stored.length,
              frames: outcome.detection.frameCount,
              assigned: outcome.grouping?.assigned ?? 0,
            });
          }
        } else {
          const job = await maybeEnqueueFaceDetectionForMedia(row, {
            force: args.force || Boolean(args.mediaId),
            replaceExisting: args.force || Boolean(args.mediaId),
            source: "scripts.analyze-videos",
          });
          if (job) {
            counts.faceEnqueued += 1;
            console.info(`${LOG} faces enqueued`, row.id, job.id);
          } else {
            counts.faceSkipped += 1;
            console.info(`${LOG} faces enqueue skipped`, row.id);
          }
        }
      } catch (error) {
        counts.faceFailed += 1;
        console.error(
          `${LOG} faces fail`,
          row.id,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  if (args.drain != null && !args.run) {
    console.info(`${LOG} draining workers`, { batch: args.drain });
    if (args.doScenes) {
      const { drainSceneAnalysisJobs } = await import("../src/workers/scene");
      const sceneDrain = await drainSceneAnalysisJobs(args.drain);
      counts.drainedScene = sceneDrain.processed.length;
      counts.drainFailures += sceneDrain.failures.length;
      for (const fail of sceneDrain.failures) {
        console.error(`${LOG} scene drain fail`, fail);
      }
    }
    if (args.doFaces) {
      const { drainFaceDetectionJobs } = await import("../src/workers/faces");
      const faceDrain = await drainFaceDetectionJobs(args.drain);
      counts.drainedFace = faceDrain.processed.length;
      counts.drainFailures += faceDrain.failures.length;
      for (const fail of faceDrain.failures) {
        console.error(`${LOG} faces drain fail`, fail);
      }
    }
  }

  console.info(`${LOG} done`, counts);

  if (!args.run && args.drain == null) {
    console.info(
      `${LOG} hint: npm run worker:scene && npm run worker:faces  (or re-run with --drain 20)`,
    );
  }

  const hardFailures = counts.sceneFailed + counts.faceFailed + counts.drainFailures;
  if (hardFailures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
