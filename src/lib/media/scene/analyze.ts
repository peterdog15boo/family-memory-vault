/**
 * Analyze clean/ready photos and videos for visual metadata (Ask AI search).
 *
 * Photos: one vision pass on the display/original image.
 * Videos: sample a few frames (ffmpeg), analyze each, aggregate onto the parent.
 *
 * Writes both legacy scene_* columns and rich ai_* / visual_analyzed_at fields.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { media, type Media } from "@/lib/db/schema";
import {
  aggregateVisionResults,
  analyzeImageVision,
  isVisionAnalysisConfigured,
  type VisionAnalysisResult,
} from "@/lib/ai/vision";
import { extractVideoSampleFrames } from "@/lib/media/video-frames";
import { isSafeToServe } from "@/lib/moderation/types";
import { getObjectBytes } from "@/lib/r2";

const LOG = "[media.scene]";

export function isSceneAnalysisEnabled(): boolean {
  if (process.env.SCENE_ANALYSIS_ENABLED === "false") return false;
  if (process.env.SCENE_ANALYSIS_ENABLED === "true") return true;
  return isVisionAnalysisConfigured();
}

/** @deprecated Prefer isEligibleSceneMedia — kept for existing imports. */
export function isEligibleScenePhoto(
  row: Pick<Media, "type" | "status" | "moderationStatus" | "contentType">,
): boolean {
  return isEligibleSceneMedia(row);
}

export function isEligibleSceneMedia(
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

function resolvePhotoSourceKey(
  row: Pick<Media, "thumbnailKey" | "processedKey" | "originalKey">,
): string {
  return row.processedKey || row.originalKey || row.thumbnailKey || "";
}

function resolveVideoSourceKey(
  row: Pick<Media, "originalKey" | "processedKey">,
): string {
  return row.originalKey || row.processedKey || "";
}

async function analyzePhotoBytes(
  row: Media,
): Promise<VisionAnalysisResult> {
  const key = resolvePhotoSourceKey(row);
  if (!key) {
    throw new Error("Missing image object key for scene analysis.");
  }
  const object = await getObjectBytes(key);
  return analyzeImageVision(object.body, {
    contentType: row.contentType ?? "image/jpeg",
  });
}

async function analyzeVideoFrames(
  row: Media,
): Promise<{ result: VisionAnalysisResult; frameCount: number } | null> {
  const key = resolveVideoSourceKey(row);
  if (!key) {
    throw new Error("Missing video object key for scene analysis.");
  }

  console.info(`${LOG} extracting video frames`, { mediaId: row.id, key });
  const object = await getObjectBytes(key);
  const sampled = await extractVideoSampleFrames(object.body, {
    durationMs: row.durationMs,
    contentType: row.contentType,
    filename: row.originalFilename,
  });

  if (sampled.frames.length === 0) {
    console.warn(`${LOG} no frames extracted`, {
      mediaId: row.id,
      errors: sampled.errors.slice(0, 5),
    });
    return null;
  }

  const frameResults: VisionAnalysisResult[] = [];
  for (const frame of sampled.frames) {
    try {
      const result = await analyzeImageVision(frame.buffer, {
        contentType: "image/jpeg",
      });
      frameResults.push(result);
    } catch (error) {
      console.warn(`${LOG} frame vision failed`, {
        mediaId: row.id,
        offsetSec: frame.offsetSec,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (frameResults.length === 0) {
    return null;
  }

  return {
    result: aggregateVisionResults(frameResults),
    frameCount: frameResults.length,
  };
}

/**
 * Run vision analysis and persist caption/tags/objects/scenes on the media row.
 */
export async function analyzeAndStoreSceneForMedia(
  mediaId: string,
  options?: { force?: boolean },
): Promise<{
  mediaId: string;
  skipped: boolean;
  skipReason?: string;
  result?: VisionAnalysisResult;
  frameCount?: number;
}> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);

  if (!row) {
    throw new Error(`analyzeAndStoreSceneForMedia: media not found (${mediaId}).`);
  }

  if (!isEligibleSceneMedia(row)) {
    await db
      .update(media)
      .set({
        sceneAnalysisStatus: "skipped",
        updatedAt: new Date(),
      })
      .where(eq(media.id, mediaId));
    return {
      mediaId,
      skipped: true,
      skipReason: "not_eligible_clean_media",
    };
  }

  const alreadyRich =
    row.sceneAnalysisStatus === "ready" &&
    row.visualAnalyzedAt &&
    ((row.aiTags?.length ?? 0) > 0 || (row.sceneTags?.length ?? 0) > 0);

  if (!options?.force && alreadyRich) {
    return {
      mediaId,
      skipped: true,
      skipReason: "already_analyzed",
    };
  }

  if (!isSceneAnalysisEnabled()) {
    await db
      .update(media)
      .set({
        sceneAnalysisStatus: "skipped",
        updatedAt: new Date(),
      })
      .where(eq(media.id, mediaId));
    return {
      mediaId,
      skipped: true,
      skipReason: "scene_analysis_disabled",
    };
  }

  if (!isVisionAnalysisConfigured()) {
    await db
      .update(media)
      .set({
        sceneAnalysisStatus: "failed",
        updatedAt: new Date(),
      })
      .where(eq(media.id, mediaId));
    throw new Error(
      "Vision analysis requires OPENAI_API_KEY and/or AWS Rekognition credentials.",
    );
  }

  await db
    .update(media)
    .set({
      sceneAnalysisStatus: "pending",
      updatedAt: new Date(),
    })
    .where(eq(media.id, mediaId));

  console.info(`${LOG} analyzing`, {
    mediaId,
    type: row.type,
  });

  try {
    let result: VisionAnalysisResult;
    let frameCount: number | undefined;

    if (row.type === "video") {
      const videoOutcome = await analyzeVideoFrames(row);
      if (!videoOutcome) {
        await db
          .update(media)
          .set({
            sceneAnalysisStatus: "failed",
            updatedAt: new Date(),
          })
          .where(eq(media.id, mediaId));
        return {
          mediaId,
          skipped: true,
          skipReason: "no_frames_extracted",
        };
      }
      result = videoOutcome.result;
      frameCount = videoOutcome.frameCount;
    } else {
      result = await analyzePhotoBytes(row);
    }

    const now = new Date();

    await db
      .update(media)
      .set({
        // Legacy scene columns (assistant + older code paths)
        sceneCaption: result.caption || null,
        sceneTags: result.tags,
        sceneAnalyzedAt: now,
        sceneAnalysisStatus: "ready",
        // Rich visual metadata
        aiCaption: result.caption || null,
        aiTags: result.tags,
        aiObjects: result.objects,
        aiScenes: result.scenes,
        aiDescription: result.description || null,
        aiEmbedding: result.embedding,
        visualAnalyzedAt: now,
        updatedAt: now,
      })
      .where(eq(media.id, mediaId));

    console.info(`${LOG} stored`, {
      mediaId,
      type: row.type,
      frameCount,
      tags: result.tags.slice(0, 12),
      objects: result.objects.slice(0, 8),
      caption: result.caption,
      provider: result.provider,
    });

    return { mediaId, skipped: false, result, frameCount };
  } catch (error) {
    await db
      .update(media)
      .set({
        sceneAnalysisStatus: "failed",
        updatedAt: new Date(),
      })
      .where(eq(media.id, mediaId));
    throw error;
  }
}
