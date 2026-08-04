import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { processMediaModeration } from "@/lib/moderation/service";
import { enqueueModerationJob } from "@/lib/queue";
import {
  authorizeWorkerRequest,
  isDevToolingEnabled,
} from "@/lib/security/worker-auth";

/**
 * POST /api/dev/moderate
 *
 * Development helper to manually trigger moderation for a media item.
 *
 * Auth: Authorization: Bearer $WORKER_SECRET (or CRON_SECRET)
 * Only available when NODE_ENV=development OR ALLOW_DEV_MODERATE=true
 *
 * Body:
 *   {
 *     "mediaId": "...",          // required
 *     "mode": "inline" | "queue" // default "inline"
 *   }
 *
 * - inline: runs processMediaModeration immediately (fastest for local testing)
 * - queue:  enqueues a moderation job for the worker to pick up
 *
 * Prefer `npm run moderate:media -- --mediaId=…` from a terminal if you want
 * the same flow without HTTP.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  mediaId: z.string().min(1),
  mode: z.enum(["inline", "queue"]).optional().default("inline"),
});

function isDevModerateAllowed(): boolean {
  // Hard-disabled in production even if ALLOW_DEV_MODERATE is set.
  return isDevToolingEnabled("ALLOW_DEV_MODERATE");
}

export async function POST(request: Request) {
  if (!isDevModerateAllowed()) {
    return NextResponse.json(
      {
        error:
          "Dev moderate endpoint disabled. Set NODE_ENV=development or ALLOW_DEV_MODERATE=true.",
      },
      { status: 403 },
    );
  }

  if (!authorizeWorkerRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { mediaId, mode } = parsed.data;
  const db = getDb();
  const [row] = await db
    .select()
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  console.info("[api.dev.moderate] trigger", {
    mediaId,
    mode,
    key: row.originalKey,
    status: row.status,
    moderationStatus: row.moderationStatus,
  });

  try {
    if (mode === "queue") {
      const job = await enqueueModerationJob({
        mediaId: row.id,
        originalKey: row.originalKey,
        contentType: row.contentType,
        userId: row.userId,
        extra: { source: "api.dev.moderate" },
      });
      return NextResponse.json({
        ok: true,
        mode: "queue",
        mediaId: row.id,
        jobId: job.id,
        message: "Moderation job enqueued. Run the worker or POST /api/jobs/moderation.",
      });
    }

    // inline — run the full pipeline now
    const outcome = await processMediaModeration(row.id, row.originalKey);

    return NextResponse.json({
      ok: true,
      mode: "inline",
      mediaId: row.id,
      decision: outcome.decision.status,
      reason: outcome.decision.reason,
      status: outcome.media.status,
      moderationStatus: outcome.media.moderationStatus,
      ncmecReportId: outcome.ncmecReportId ?? outcome.media.ncmecReportId,
      originalKey: outcome.media.originalKey,
    });
  } catch (error) {
    console.error("[api.dev.moderate] failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Moderation failed",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  if (!isDevModerateAllowed() || !authorizeWorkerRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    endpoint: "/api/dev/moderate",
    usage: {
      method: "POST",
      body: { mediaId: "<id>", mode: "inline | queue" },
      script: "npm run moderate:media -- --mediaId=<id>",
    },
  });
}
