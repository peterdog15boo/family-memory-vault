/**
 * Manually trigger moderation for one media item (local / ops testing).
 *
 * Usage:
 *   npm run moderate:media -- --mediaId=<id>
 *   npm run moderate:media -- --mediaId=<id> --mode=queue
 *
 * Modes:
 *   inline (default) — runs processMediaModeration immediately
 *   queue            — enqueues a moderation job for the worker
 */

import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: ".env.local", override: true });
config({ override: true });

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
  const mode = (argValue("mode") ?? "inline").toLowerCase();

  if (!mediaId) {
    console.error(
      "Usage: npm run moderate:media -- --mediaId=<id> [--mode=inline|queue]",
    );
    process.exit(1);
  }

  if (mode !== "inline" && mode !== "queue") {
    console.error('mode must be "inline" or "queue"');
    process.exit(1);
  }

  const { getDb } = await import("../src/lib/db");
  const { media } = await import("../src/lib/db/schema");
  const db = getDb();

  const [row] = await db
    .select()
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);

  if (!row) {
    console.error(`Media not found: ${mediaId}`);
    process.exit(1);
  }

  console.log("[moderate:media] found", {
    mediaId: row.id,
    status: row.status,
    moderationStatus: row.moderationStatus,
    originalKey: row.originalKey,
    mode,
  });

  if (mode === "queue") {
    const { enqueueModerationJob } = await import("../src/lib/queue");
    const job = await enqueueModerationJob({
      mediaId: row.id,
      originalKey: row.originalKey,
      contentType: row.contentType,
      userId: row.userId,
      extra: { source: "scripts/moderate-media" },
    });
    console.log("[moderate:media] job enqueued", {
      jobId: job.id,
      hint: "Run: npm run worker:moderation",
    });
    return;
  }

  const { processMediaModeration } = await import(
    "../src/lib/moderation/service"
  );
  const outcome = await processMediaModeration(row.id, row.originalKey);

  console.log("[moderate:media] done", {
    decision: outcome.decision.status,
    reason: outcome.decision.reason,
    status: outcome.media.status,
    moderationStatus: outcome.media.moderationStatus,
    ncmecReportId: outcome.ncmecReportId ?? outcome.media.ncmecReportId,
    originalKey: outcome.media.originalKey,
  });
}

main().catch((error) => {
  console.error("[moderate:media] failed", error);
  process.exit(1);
});
