/**
 * Human review queue: borderline scores, scanner failures, and auto adult/reject
 * (non-CSAM). Reviewers can approve as clean so false positives reach Photos.
 */

import { asc, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { logAdminAudit } from "@/lib/admin/audit";
import { assertAdminUser } from "@/lib/auth/admin";
import { getDb } from "@/lib/db";
import { media, moderationEvents, type Media } from "@/lib/db/schema";
import { updateMediaModerationStatus } from "@/lib/moderation/db";
import { reportCsamIncidentForMedia } from "@/lib/moderation/ncmec";
import type { ModerationResult, ModerationStatus } from "@/lib/moderation/types";
import { maybeEnqueueFaceDetectionForMedia } from "@/lib/faces/pipeline";
import { maybeEnqueueSceneAnalysisForMedia } from "@/lib/media/scene";
import { maybeGenerateThumbnailForMedia } from "@/lib/media/thumbnails";
import {
  getInternalDownloadUrl,
  isOriginalsKey,
  isTempKey,
  promoteTempToOriginals,
  tempKeyToOriginalsKey,
} from "@/lib/r2";
import { isR2Configured } from "@/lib/upload/constants";

export type HumanReviewAction =
  | "clean"
  | "adult"
  | "csam_quarantined"
  | "rejected";

export type HumanReviewQueueItem = {
  id: string;
  userId: string;
  type: Media["type"];
  contentType: string;
  originalFilename: string | null;
  originalKey: string;
  status: Media["status"];
  moderationStatus: Media["moderationStatus"];
  photodnaMatch: boolean;
  aiCsamScore: number | null;
  aiNudityScore: number | null;
  moderationLabels: Media["moderationLabels"];
  createdAt: Date;
  updatedAt: Date;
  /** Short-lived admin-only preview URL (never for family surfaces). */
  previewUrl: string | null;
};

const ACTION_TO_STATUS: Record<HumanReviewAction, ModerationStatus> = {
  clean: "clean",
  adult: "adult",
  csam_quarantined: "csam_quarantined",
  rejected: "rejected",
};

/** Non-CSAM holds a human can clear — auto-adult/reject used to hide these from Review. */
export const HUMAN_REVIEW_QUEUE_STATUSES = [
  "needs_human_review",
  "adult",
  "rejected",
] as const satisfies readonly ModerationStatus[];

export function isHumanReviewQueueStatus(
  status: string,
): status is (typeof HUMAN_REVIEW_QUEUE_STATUSES)[number] {
  return (HUMAN_REVIEW_QUEUE_STATUSES as readonly string[]).includes(status);
}

/**
 * List media awaiting human review. Admin-only.
 * Preview URLs use internal signing (not the clean-only family gate).
 */
export async function listMediaNeedingHumanReview(
  actorUserId: string,
  options?: { limit?: number },
): Promise<HumanReviewQueueItem[]> {
  await assertAdminUser(actorUserId);

  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  const db = getDb();

  const rows = await db
    .select()
    .from(media)
    .where(inArray(media.moderationStatus, [...HUMAN_REVIEW_QUEUE_STATUSES]))
    .orderBy(asc(media.updatedAt), desc(media.createdAt))
    .limit(limit);

  const r2Ready = isR2Configured();

  return Promise.all(
    rows.map(async (row) => {
      let previewUrl: string | null = null;
      if (r2Ready) {
        try {
          const key = row.thumbnailKey || row.processedKey || row.originalKey;
          // Admin review only — internal helper refuses quarantine/ keys.
          const signed = await getInternalDownloadUrl(key, 60 * 10);
          previewUrl = signed.url;
        } catch (error) {
          console.error(
            "[moderation.review] Failed to sign admin preview URL",
            row.id,
            error,
          );
        }
      }

      return {
        id: row.id,
        userId: row.userId,
        type: row.type,
        contentType: row.contentType,
        originalFilename: row.originalFilename,
        originalKey: row.originalKey,
        status: row.status,
        moderationStatus: row.moderationStatus,
        photodnaMatch: row.photodnaMatch,
        aiCsamScore: row.aiCsamScore,
        aiNudityScore: row.aiNudityScore,
        moderationLabels: row.moderationLabels,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        previewUrl,
      };
    }),
  );
}

export async function countMediaNeedingHumanReview(
  actorUserId: string,
): Promise<number> {
  await assertAdminUser(actorUserId);
  const db = getDb();
  const rows = await db
    .select({ id: media.id })
    .from(media)
    .where(inArray(media.moderationStatus, [...HUMAN_REVIEW_QUEUE_STATUSES]));
  return rows.length;
}

async function ensureCleanPermanentLocation(row: Media): Promise<Media> {
  if (!isTempKey(row.originalKey)) {
    if (isOriginalsKey(row.originalKey)) return row;
    return row;
  }

  const destination = tempKeyToOriginalsKey(row.originalKey);
  const moved = await promoteTempToOriginals(row.originalKey, destination);
  const db = getDb();
  const [updated] = await db
    .update(media)
    .set({ originalKey: moved.toKey, updatedAt: new Date() })
    .where(eq(media.id, row.id))
    .returning();
  return updated ?? { ...row, originalKey: moved.toKey };
}

/**
 * Apply a human reviewer's decision to a media item currently in needs_human_review
 * (or still pending — allowed for admin override).
 */
export async function applyHumanReviewDecision(options: {
  mediaId: string;
  actorUserId: string;
  action: HumanReviewAction;
  notes?: string;
}): Promise<Media> {
  const { mediaId, actorUserId, action, notes } = options;
  await assertAdminUser(actorUserId);

  const db = getDb();
  const [existing] = await db
    .select()
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);

  if (!existing) {
    throw new Error(`Media not found: ${mediaId}`);
  }

  if (
    !isHumanReviewQueueStatus(existing.moderationStatus) &&
    existing.moderationStatus !== "pending"
  ) {
    throw new Error(
      `Media ${mediaId} is not in the human review queue (status=${existing.moderationStatus}).`,
    );
  }

  const reason =
    notes?.trim() ||
    `Human review decision: ${action} by admin ${actorUserId}.`;

  console.info("[moderation.review] Applying human decision", {
    mediaId,
    action,
    actorUserId,
    previous: existing.moderationStatus,
  });

  // CSAM path: quarantine + NCMEC (reportCsamIncident quarantines idempotently).
  if (action === "csam_quarantined") {
    const report = await reportCsamIncidentForMedia(mediaId, existing.originalKey, {
      detectedAt: new Date(),
      additionalInfo: reason,
      moderationResult: {
        photodnaMatch: existing.photodnaMatch,
        aiCsamScore: existing.aiCsamScore,
        aiNudityScore: existing.aiNudityScore,
        labels: existing.moderationLabels,
        provider: "human.review",
        notes: reason,
      },
    });

    await db.insert(moderationEvents).values({
      id: nanoid(),
      mediaId,
      eventType: "moderation.human_review",
      source: "admin.review",
      previousStatus: existing.status,
      newStatus: report.media.status,
      previousModerationStatus: existing.moderationStatus,
      newModerationStatus: "csam_quarantined",
      actorId: actorUserId,
      photodnaMatch: existing.photodnaMatch,
      aiCsamScore: existing.aiCsamScore,
      aiNudityScore: existing.aiNudityScore,
      labels: existing.moderationLabels,
      notes: reason,
      metadata: {
        action,
        ncmecReportId: report.reportId,
      },
      createdAt: new Date(),
    });

    await logAdminAudit({
      actorId: actorUserId,
      action:
        action === "csam_quarantined"
          ? "moderation.quarantine"
          : "moderation.review",
      targetType: "media",
      targetId: mediaId,
      metadata: {
        action,
        previousModerationStatus: existing.moderationStatus,
        newModerationStatus: "csam_quarantined",
        ncmecReportId: report.reportId,
        notes: reason,
      },
    });

    return report.media;
  }

  const nextStatus = ACTION_TO_STATUS[action];
  const moderationResult: ModerationResult = {
    photodnaMatch: existing.photodnaMatch,
    aiCsamScore: existing.aiCsamScore,
    aiNudityScore: existing.aiNudityScore,
    labels: existing.moderationLabels,
    provider: "human.review",
    notes: reason,
    raw: { action, actorUserId },
  };

  let updated = await updateMediaModerationStatus(
    mediaId,
    nextStatus,
    moderationResult,
  );

  if (action === "clean") {
    updated = await ensureCleanPermanentLocation(updated);
    if (updated.status !== "ready" || updated.moderationStatus !== "clean") {
      const [fixed] = await db
        .update(media)
        .set({
          status: "ready",
          moderationStatus: "clean",
          updatedAt: new Date(),
        })
        .where(eq(media.id, mediaId))
        .returning();
      updated = fixed ?? updated;
    }

    // Non-blocking face + scene pipelines (separate workers).
    await maybeGenerateThumbnailForMedia(updated);
    if (updated.type === "video" || updated.contentType?.startsWith("video/")) {
      const { maybeGenerateVideoPlaybackProxy } = await import(
        "@/lib/media/video-playback"
      );
      void maybeGenerateVideoPlaybackProxy(updated);
    }
    await maybeEnqueueFaceDetectionForMedia(updated, {
      source: "moderation.human_review.clean",
      fanOutFamilyViewers: true,
    });
    await maybeEnqueueSceneAnalysisForMedia(updated, {
      source: "moderation.human_review.clean",
    });

    const { afterPhotoBecameLibraryReady } = await import(
      "@/lib/gamification/photo-ready"
    );
    await afterPhotoBecameLibraryReady({
      userId: updated.userId,
      mediaId: updated.id,
      filename: updated.originalFilename,
      mediaType: updated.type,
    });
  }

  // Dedicated human-review audit row with actor (status_updated may lack actor).
  await db.insert(moderationEvents).values({
    id: nanoid(),
    mediaId,
    eventType: "moderation.human_review",
    source: "admin.review",
    previousStatus: existing.status,
    newStatus: updated.status,
    previousModerationStatus: existing.moderationStatus,
    newModerationStatus: updated.moderationStatus,
    actorId: actorUserId,
    photodnaMatch: updated.photodnaMatch,
    aiCsamScore: updated.aiCsamScore,
    aiNudityScore: updated.aiNudityScore,
    labels: updated.moderationLabels,
    notes: reason,
    metadata: { action },
    createdAt: new Date(),
  });

  await logAdminAudit({
    actorId: actorUserId,
    action: "moderation.review",
    targetType: "media",
    targetId: mediaId,
    metadata: {
      action,
      previousModerationStatus: existing.moderationStatus,
      newModerationStatus: updated.moderationStatus,
      notes: reason,
    },
  });

  console.info("[moderation.review] Decision applied", {
    mediaId,
    action,
    moderationStatus: updated.moderationStatus,
    status: updated.status,
  });

  return updated;
}
