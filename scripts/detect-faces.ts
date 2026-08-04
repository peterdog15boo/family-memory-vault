/**
 * Manually trigger face detection + grouping (dev / backfill).
 *
 * Usage:
 *   npm run detect:faces -- --mediaId=<id>
 *   npm run detect:faces -- --mediaId=<id> --mode=queue
 *   npm run detect:faces -- --userId=<id> --allClean --mode=queue
 *   npm run detect:faces -- --userId=<id> --allClean --include-videos --mode=queue
 *   npm run detect:faces -- --mediaId=<id> --replace
 *
 * Modes:
 *   inline (default) — detect + group immediately
 *   queue            — enqueue face.detect for the faces worker
 */

import { config } from "dotenv";
import { and, desc, eq, inArray } from "drizzle-orm";

config({ path: ".env.local", override: true });
config({ override: true });

// Neon TLS often fails on Windows without this (fetch failed / certificate errors).
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED == null) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function argValue(name: string): string | undefined {
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
  const mediaId = argValue("mediaId");
  const userId = argValue("userId");
  const mode = (argValue("mode") ?? "inline").toLowerCase();
  const replaceExisting = hasFlag("replace");
  const allClean = hasFlag("allClean");
  const includeVideos =
    hasFlag("include-videos") || hasFlag("videos") || hasFlag("includeVideos");
  const videosOnly = hasFlag("videos-only") || hasFlag("videosOnly");
  const limit = Number(argValue("limit") ?? 50);

  if (!mediaId && !(userId && allClean)) {
    console.error(`Usage:
  npm run detect:faces -- --mediaId=<id> [--mode=inline|queue] [--replace]
  npm run detect:faces -- --userId=<id> --allClean [--include-videos] [--videos-only] [--mode=queue] [--limit=50] [--replace]`);
    process.exit(1);
  }

  if (mode !== "inline" && mode !== "queue") {
    console.error('mode must be "inline" or "queue"');
    process.exit(1);
  }

  const { getDb } = await import("../src/lib/db");
  const { media } = await import("../src/lib/db/schema");
  const { cleanReadyMediaFilter } = await import("../src/lib/media/queries");
  const db = getDb();

  const types = videosOnly
    ? (["video"] as const)
    : includeVideos
      ? (["photo", "video"] as const)
      : (["photo"] as const);

  let rows;
  if (mediaId) {
    rows = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);
    if (rows.length === 0) {
      console.error(`Media not found: ${mediaId}`);
      process.exit(1);
    }
  } else {
    rows = await db
      .select()
      .from(media)
      .where(and(cleanReadyMediaFilter(userId!), inArray(media.type, [...types])))
      .orderBy(desc(media.createdAt))
      .limit(Math.min(Math.max(limit, 1), 200));
  }

  console.log("[detect:faces] targets", {
    count: rows.length,
    mode,
    replaceExisting,
    types: [...types],
  });

  if (mode === "queue") {
    const { enqueueFaceDetectionJob } = await import("../src/lib/queue");
    for (const row of rows) {
      const job = await enqueueFaceDetectionJob({
        mediaId: row.id,
        userId: row.userId,
        replaceExisting,
        extra: { source: "scripts/detect-faces" },
      });
      console.log("[detect:faces] enqueued", {
        mediaId: row.id,
        type: row.type,
        jobId: job.id,
      });
    }
    console.log("[detect:faces] hint: npm run worker:faces");
    return;
  }

  const { processFacesForMedia } = await import("../src/lib/faces/pipeline");
  for (const row of rows) {
    try {
      const outcome = await processFacesForMedia(row.id, {
        userId: row.userId,
        replaceExisting,
      });
      console.log("[detect:faces] done", {
        mediaId: row.id,
        type: row.type,
        skipped: outcome.detection.skipped,
        skipReason: outcome.detection.skipReason,
        provider: outcome.detection.provider,
        detected: outcome.detection.detectedCount,
        stored: outcome.detection.stored.length,
        frames: outcome.detection.frameCount,
        assigned: outcome.grouping?.assigned ?? 0,
        created: outcome.grouping?.created ?? 0,
      });
    } catch (error) {
      console.error("[detect:faces] media failed — continuing", {
        mediaId: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

main().catch((error) => {
  console.error("[detect:faces] failed", error);
  process.exit(1);
});
