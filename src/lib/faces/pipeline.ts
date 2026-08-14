/**
 * Face processing pipeline — detect then group, plus safe post-clean enqueue.
 *
 * Designed so moderation never waits on face work: enqueue is best-effort and
 * swallows errors; the faces worker runs asynchronously.
 *
 * Shared family media: jobs may target an actorUserId (family viewer) so
 * detections/matches land on that viewer's People graph. Owner face rows are
 * reused when present; otherwise detection runs for the actor.
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
  /**
   * Actor whose People receive matches. Defaults to media owner.
   * For shared media, pass the family viewer.
   */
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
 * Grouping always runs against the actor userId (owner or family viewer).
 */
export async function processFacesForMedia(
  mediaId: string,
  options: ProcessFacesForMediaOptions = {},
): Promise<ProcessFacesForMediaResult> {
  const db = getDb();
  const [row] = await db
    .select({ userId: media.userId })
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);

  const actorUserId = options.userId?.trim() || row?.userId;
  if (!actorUserId) {
    throw new Error(`Cannot process faces — missing userId for media ${mediaId}`);
  }

  const detection = await detectAndStoreFacesForMedia(mediaId, {
    userId: actorUserId,
    replaceExisting: options.replaceExisting,
  });

  let grouping: GroupFacesResult | null = null;
  if (!options.skipGrouping) {
    const faceIds = detection.stored.map((f) => f.id);
    if (faceIds.length > 0) {
      grouping = shouldUseRekognitionIdentity()
        ? await groupFacesWithRekognitionIdentity(actorUserId, faceIds)
        : await groupFaces(actorUserId, faceIds);
    }
  }

  return { mediaId, userId: actorUserId, detection, grouping };
}

export type MaybeEnqueueFaceDetectionOptions = {
  replaceExisting?: boolean;
  source?: string;
  /** Enqueue even if faces already exist (implies replaceExisting on the job). */
  force?: boolean;
  delayMs?: number;
  /**
   * Viewer whose People graph should receive faces.
   * Defaults to media owner. Family members use their own userId.
   */
  actorUserId?: string;
  /** Also enqueue face.detect for active family co-members (owner clean path). */
  fanOutFamilyViewers?: boolean;
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

    const actorUserId = options.actorUserId?.trim() || row.userId;

    if (await hasActiveFaceDetectionJob(row.id, actorUserId)) {
      console.info(`${LOG} skip enqueue — active face.detect job exists`, {
        mediaId: row.id,
        actorUserId,
      });
      return null;
    }

    const replaceExisting = Boolean(options.replaceExisting || options.force);

    if (!replaceExisting) {
      const db = getDb();
      const [existingFace] = await db
        .select({ id: faces.id })
        .from(faces)
        .where(and(eq(faces.mediaId, row.id), eq(faces.userId, actorUserId)))
        .limit(1);

      if (existingFace) {
        console.info(`${LOG} skip enqueue — faces already stored for actor`, {
          mediaId: row.id,
          actorUserId,
        });
        // Still fan-out to family viewers when requested (owner path).
        if (options.fanOutFamilyViewers && actorUserId === row.userId) {
          await maybeEnqueueFaceDetectionForFamilyViewers(row, options);
        }
        return null;
      }
    }

    const job = await enqueueFaceDetectionJob({
      mediaId: row.id,
      userId: actorUserId,
      replaceExisting,
      delayMs: options.delayMs ?? 1_000,
      extra: {
        source: options.source ?? "pipeline.maybeEnqueue",
      },
    });

    console.info(`${LOG} face.detect enqueued`, {
      mediaId: row.id,
      jobId: job.id,
      actorUserId,
      source: options.source ?? "pipeline.maybeEnqueue",
    });

    if (options.fanOutFamilyViewers && actorUserId === row.userId) {
      await maybeEnqueueFaceDetectionForFamilyViewers(row, options);
    }

    return job;
  } catch (error) {
    console.error(`${LOG} enqueue failed (non-fatal)`, {
      mediaId: row.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function maybeEnqueueFaceDetectionForFamilyViewers(
  row: Pick<
    Media,
    "id" | "userId" | "type" | "status" | "moderationStatus" | "contentType"
  >,
  options: MaybeEnqueueFaceDetectionOptions,
): Promise<void> {
  try {
    const { getFamilyViewerIdsForOwner } = await import("@/lib/permissions");
    const viewers = await getFamilyViewerIdsForOwner(row.userId);
    for (const viewerId of viewers) {
      await maybeEnqueueFaceDetectionForMedia(row, {
        actorUserId: viewerId,
        source: `${options.source ?? "pipeline.maybeEnqueue"}.family_viewer`,
        delayMs: (options.delayMs ?? 1_000) + 500,
        // Do not recurse fan-out.
        fanOutFamilyViewers: false,
        force: options.force,
        replaceExisting: options.replaceExisting,
      });
    }
  } catch (error) {
    console.error(`${LOG} family viewer fan-out failed (non-fatal)`, {
      mediaId: row.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
