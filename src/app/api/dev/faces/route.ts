import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { processFacesForMedia } from "@/lib/faces/pipeline";
import { cleanReadyMediaFilter } from "@/lib/media/queries";
import { enqueueFaceDetectionJob } from "@/lib/queue";
import {
  authorizeWorkerRequest,
  isDevToolingEnabled,
} from "@/lib/security/worker-auth";

/**
 * POST /api/dev/faces
 *
 * Dev / backfill helper for face detection + grouping.
 *
 * Auth: Bearer WORKER_SECRET (or CRON_SECRET)
 * Available when NODE_ENV=development OR ALLOW_DEV_FACES=true
 *
 * Body:
 *   {
 *     "mediaId": "...",              // one media
 *     // OR
 *     "userId": "...",               // all clean photos for user (backfill)
 *     "limit": 50,                   // cap for user backfill (default 50, max 200)
 *     "mode": "inline" | "queue",    // default inline
 *     "replaceExisting": false
 *   }
 */

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z
  .object({
    mediaId: z.string().min(1).optional(),
    userId: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    mode: z.enum(["inline", "queue"]).optional().default("inline"),
    replaceExisting: z.boolean().optional().default(false),
  })
  .refine((v) => Boolean(v.mediaId || v.userId), {
    message: "Provide mediaId or userId.",
  });

function isDevFacesAllowed(): boolean {
  return isDevToolingEnabled("ALLOW_DEV_FACES");
}

export async function POST(request: Request) {
  if (!isDevFacesAllowed()) {
    return NextResponse.json(
      {
        error:
          "Dev faces endpoint disabled. Set NODE_ENV=development or ALLOW_DEV_FACES=true.",
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

  const { mode, replaceExisting } = parsed.data;
  const db = getDb();

  let rows =
    parsed.data.mediaId
      ? await db
          .select()
          .from(media)
          .where(eq(media.id, parsed.data.mediaId))
          .limit(1)
      : await db
          .select()
          .from(media)
          .where(
            and(
              cleanReadyMediaFilter(parsed.data.userId!),
              inArray(media.type, ["photo", "video"]),
            ),
          )
          .orderBy(desc(media.createdAt))
          .limit(parsed.data.limit ?? 50);

  if (parsed.data.mediaId && rows.length === 0) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  // Single-media path: still allow enqueue even if not yet clean (worker will skip).
  rows = rows.filter((row) => row.type === "photo" || row.type === "video");

  console.info("[api.dev.faces] trigger", {
    mode,
    replaceExisting,
    count: rows.length,
    mediaId: parsed.data.mediaId,
    userId: parsed.data.userId,
  });

  try {
    if (mode === "queue") {
      const jobs = [];
      for (const row of rows) {
        const job = await enqueueFaceDetectionJob({
          mediaId: row.id,
          userId: row.userId,
          replaceExisting,
          extra: { source: "api.dev.faces" },
        });
        jobs.push({ mediaId: row.id, jobId: job.id });
      }
      return NextResponse.json({
        ok: true,
        mode: "queue",
        enqueued: jobs.length,
        jobs,
        message:
          "Face detection jobs enqueued. Run npm run worker:faces or POST /api/jobs/faces.",
      });
    }

    const results = [];
    for (const row of rows) {
      const outcome = await processFacesForMedia(row.id, {
        userId: row.userId,
        replaceExisting,
      });
      results.push({
        mediaId: row.id,
        skipped: outcome.detection.skipped,
        skipReason: outcome.detection.skipReason,
        provider: outcome.detection.provider,
        detected: outcome.detection.detectedCount,
        stored: outcome.detection.stored.length,
        assigned: outcome.grouping?.assigned ?? 0,
        created: outcome.grouping?.created ?? 0,
      });
    }

    return NextResponse.json({
      ok: true,
      mode: "inline",
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error("[api.dev.faces] failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Face processing failed",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  if (!isDevFacesAllowed() || !authorizeWorkerRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    endpoint: "/api/dev/faces",
    usage: {
      method: "POST",
      body: {
        mediaId: "<id>",
        mode: "inline | queue",
        replaceExisting: false,
      },
      or: {
        userId: "<clerkUserId>",
        limit: 50,
        mode: "queue",
      },
      script: "npm run detect:faces -- --mediaId=<id>",
    },
  });
}
