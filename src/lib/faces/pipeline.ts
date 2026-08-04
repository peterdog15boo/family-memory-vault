/**
 * Face processing pipeline — detect then group, plus safe post-clean enqueue.
 *
 * Designed so moderation never waits on face work: enqueue is best-effort and
 * swallows errors; the faces worker runs asynchronously.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { faces, media, type Media, type ProcessingJob } from "@/lib/db/schema";
import {
  detectAndStoreFacesForMedia,
  type DetectAndStoreFacesResult,
} from "@/lib/faces/detection";
import {
  groupFaces,
  type GroupFacesResult,
} from "@/lib/faces/grouping";
import {
  groupFacesWithRekognitionIdentity,
  shouldUseRekognitionIdentity,
} from "@/lib/faces/identity-grouping";
import { isSafeToServe } from "@/lib/moderation/types";
import {
  enqueueFaceDetectionJob,
  hasActiveFaceDetectionJob,
} from "@/lib/queue";

const LOG = "[faces.pipeline]";

export type ProcessFacesForMediaOptions = {
  userId?: string;
  replaceExisting?: boolean;
  /** Skip grouping after detect (rare; tests). Default false. */
  skipGrouping?: boolean;
};

export type ProcessFacesForMediaResult = {
  mediaId: string;
  userId: string;
  detection: DetectAndStoreFacesResult;
  grouping: GroupFacesResult | null;
};

function isEligibleFaceMedia(
  row: Pick<Media, "type" | "status" | "moderationStatus" | "contentType">,
): boolean {
  if (!isSafeToServe(row.moderationStatus) || row.status !== "ready") {
    return false;
  }
  const ct = row.contentType?.toLowerCase() ?? "";
  if (row.type === "photo") {
    if (ct && !ct.startsWith("image/")) return false;
    return true;
  }
  if (row.type === "video") {
    if (ct && !ct.startsWith("video/")) return false;
    return true;
  }
  return false;
}

/**
 * Detect faces on a clean photo or video, then assign/create people for new faces.
 */
export async function processFacesForMedia(
  mediaId: string,
  options: ProcessFacesForMediaOptions = {},
): Promise<ProcessFacesForMediaResult> {
  const detection = await detectAndStoreFacesForMedia(mediaId, {
    userId: options.userId,
    replaceExisting: options.replaceExisting,
  });

  const db = getDb();
  const [row] = await db
    .select({ userId: media.userId })
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);

  const userId = row?.userId ?? options.userId;
  if (!userId) {
    throw new Error(`Cannot group faces — missing userId for media ${mediaId}`);
  }

  let grouping: GroupFacesResult | null = null;
  if (!options.skipGrouping) {
    const faceIds = detection.stored.map((f) => f.id);
    if (faceIds.length > 0) {
      grouping = shouldUseRekognitionIdentity()
        ? await groupFacesWithRekognitionIdentity(userId, faceIds)
        : await groupFaces(userId, faceIds);
    }
  }

  return { mediaId, userId, detection, grouping };
}

export type MaybeEnqueueFaceDetectionOptions = {
  replaceExisting?: boolean;
  source?: string;
  /** Enqueue even if faces already exist (implies replaceExisting on the job). */
  force?: boolean;
  delayMs?: number;
};

/**
 * Best-effort enqueue after media becomes clean/ready.
 * Never throws — failures are logged so moderation is never blocked.
 */
export async function maybeEnqueueFaceDetectionForMedia(
  row: Pick<
    Media,
    "id" | "userId" | "type" | "status" | "moderationStatus" | "contentType"
  >,
  options: MaybeEnqueueFaceDetectionOptions = {},
): Promise<ProcessingJob | null> {
  try {
    if (!isEligibleFaceMedia(row)) {
      console.info(`${LOG} skip enqueue — not eligible clean media`, {
        mediaId: row.id,
        type: row.type,
        status: row.status,
        moderationStatus: row.moderationStatus,
      });
      return null;
    }

    if (await hasActiveFaceDetectionJob(row.id)) {
      console.info(`${LOG} skip enqueue — active face.detect job exists`, {
        mediaId: row.id,
      });
      return null;
    }

    const replaceExisting = Boolean(options.replaceExisting || options.force);

    if (!replaceExisting) {
      const db = getDb();
      const [existingFace] = await db
        .select({ id: faces.id })
        .from(faces)
        .where(and(eq(faces.mediaId, row.id), eq(faces.userId, row.userId)))
        .limit(1);

      if (existingFace) {
        console.info(`${LOG} skip enqueue — faces already stored`, {
          mediaId: row.id,
        });
        return null;
      }
    }

    const job = await enqueueFaceDetectionJob({
      mediaId: row.id,
      userId: row.userId,
      replaceExisting,
      delayMs: options.delayMs ?? 1_000,
      extra: {
        source: options.source ?? "pipeline.maybeEnqueue",
      },
    });

    console.info(`${LOG} face.detect enqueued`, {
      mediaId: row.id,
      jobId: job.id,
      source: options.source ?? "pipeline.maybeEnqueue",
    });
    return job;
  } catch (error) {
    console.error(`${LOG} enqueue failed (non-fatal)`, {
      mediaId: row.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
