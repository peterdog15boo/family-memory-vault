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
import { suppressDismissedLabels } from "@/lib/media/tags";
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

/**
 * True when the media row already has searchable AI/scene labels for Ask AI
 * and Photos filtering. Used to skip re-analysis / decide backfill.
 */
export function hasSearchableVisualLabels(
  row: Pick<
    Media,
    | "aiTags"
    | "aiObjects"
    | "aiScenes"
    | "sceneTags"
    | "aiCaption"
    | "sceneCaption"
    | "visualAnalyzedAt"
  >,
): boolean {
  if (!row.visualAnalyzedAt) return false;
  return (
    (row.aiTags?.length ?? 0) > 0 ||
    (row.aiObjects?.length ?? 0) > 0 ||
    (row.aiScenes?.length ?? 0) > 0 ||
    (row.sceneTags?.length ?? 0) > 0 ||
    Boolean(row.aiCaption?.trim()) ||
    Boolean(row.sceneCaption?.trim())
  );
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

  if (
    !options?.force &&
    row.sceneAnalysisStatus === "ready" &&
    hasSearchableVisualLabels(row)
  ) {
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
    console.warn(`${LOG} skipped — scene analysis disabled / vision not configured`, {
      mediaId,
    });
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
    const dismissed = row.dismissedAiTags ?? [];
    const tags = suppressDismissedLabels(result.tags, dismissed);
    const objects = suppressDismissedLabels(result.objects, dismissed);
    const scenes = suppressDismissedLabels(result.scenes, dismissed);

    await db
      .update(media)
      .set({
        // Legacy scene columns (assistant + older code paths)
        sceneCaption: result.caption || null,
        sceneTags: tags,
        sceneAnalyzedAt: now,
        sceneAnalysisStatus: "ready",
        // Rich visual metadata — queryable by Ask AI + Photos tag search
        aiCaption: result.caption || null,
        aiTags: tags,
        aiObjects: objects,
        aiScenes: scenes,
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
      tags: tags.slice(0, 12),
      objects: objects.slice(0, 8),
      scenes: scenes.slice(0, 8),
      caption: result.caption,
      provider: result.provider,
      suppressedDismissed: dismissed.length,
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

/**
 * Manually set AI tags on owned media (owner only). Keeps objects/scenes intact
 * unless provided; always refreshes visualAnalyzedAt for search readiness.
 */
export async function updateMediaVisualTags(input: {
  userId: string;
  mediaId: string;
  aiTags?: string[];
  aiObjects?: string[];
  aiScenes?: string[];
  aiCaption?: string | null;
}): Promise<Media> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(media)
    .where(eq(media.id, input.mediaId))
    .limit(1);

  if (!row || row.userId !== input.userId) {
    throw new Error("Media not found.");
  }
  if (!isEligibleSceneMedia(row)) {
    throw new Error("Only clean, ready photos or videos can have tags.");
  }

  const clean = (values: string[] | undefined, max: number) => {
    if (!values) return undefined;
    const out: string[] = [];
    for (const raw of values) {
      const n = raw.trim().toLowerCase();
      if (n.length < 2 || n.length > 48) continue;
      if (out.includes(n)) continue;
      out.push(n);
      if (out.length >= max) break;
    }
    return out;
  };

  const now = new Date();
  const dismissed = row.dismissedAiTags ?? [];
  const nextTags = suppressDismissedLabels(
    clean(input.aiTags, 48) ?? row.aiTags ?? [],
    dismissed,
  );
  const nextObjects = suppressDismissedLabels(
    clean(input.aiObjects, 28) ?? row.aiObjects ?? [],
    dismissed,
  );
  const nextScenes = suppressDismissedLabels(
    clean(input.aiScenes, 18) ?? row.aiScenes ?? [],
    dismissed,
  );
  const nextCaption =
    input.aiCaption !== undefined
      ? input.aiCaption?.trim() || null
      : row.aiCaption;

  const [updated] = await db
    .update(media)
    .set({
      aiTags: nextTags,
      sceneTags: nextTags,
      aiObjects: nextObjects,
      aiScenes: nextScenes,
      aiCaption: nextCaption,
      sceneCaption: nextCaption,
      sceneAnalysisStatus: "ready",
      sceneAnalyzedAt: row.sceneAnalyzedAt ?? now,
      visualAnalyzedAt: now,
      updatedAt: now,
    })
    .where(eq(media.id, input.mediaId))
    .returning();

  if (!updated) throw new Error("Failed to update media tags.");
  return updated;
}
