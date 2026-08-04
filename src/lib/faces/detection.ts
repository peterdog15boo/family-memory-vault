/**
 * Face detection service.
 *
 * Runs a pluggable detector on clean photo or video media, then persists rows
 * into `faces` linked to that media. Videos are sampled via ffmpeg frames.
 *
 * Provider switch: FACE_DETECTION_PROVIDER=rekognition|google_vision|mock
 * Enable live calls: FACE_DETECTION_ENABLED=true (+ provider credentials)
 *
 * Usage:
 *   import { detectAndStoreFacesForMedia } from "@/lib/faces/detection";
 *   await detectAndStoreFacesForMedia(mediaId);
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { media, type Face, type Media } from "@/lib/db/schema";
import {
  googleVisionFaceDetectionProvider,
  isGoogleVisionFaceDetectionConfigured,
} from "@/lib/faces/providers/google-vision";
import { mockFaceDetectionProvider } from "@/lib/faces/providers/mock";
import {
  isRekognitionFaceDetectionConfigured,
  rekognitionFaceDetectionProvider,
} from "@/lib/faces/providers/rekognition";
import {
  FACE_DETECTION_PROVIDERS,
  FaceDetectionError,
  type DetectedFace,
  type FaceDetectionProvider,
  type FaceDetectionProviderName,
  type FaceDetectionProviderResult,
} from "@/lib/faces/providers/types";
import { extractVideoSampleFrames } from "@/lib/media/video-frames";
import { isSafeToServe } from "@/lib/moderation/types";
import {
  createFace,
  deleteFacesForMedia,
  listFacesForMedia,
} from "@/lib/people";
import { getObjectBytes } from "@/lib/r2";

const LOG = "[faces.detection]";

export type {
  DetectedFace,
  FaceDetectionProvider,
  FaceDetectionProviderName,
  FaceDetectionProviderResult,
};
export { FaceDetectionError, FACE_DETECTION_PROVIDERS };

export type DetectAndStoreFacesOptions = {
  /** When set, must match media.user_id. */
  userId?: string;
  /**
   * If faces already exist for this media:
   * - false (default): skip detection and return existing rows
   * - true: delete existing faces then re-detect
   */
  replaceExisting?: boolean;
  /** Override provider resolution (tests). */
  provider?: FaceDetectionProvider;
};

export type DetectAndStoreFacesResult = {
  mediaId: string;
  provider: string;
  mock: boolean;
  skipped: boolean;
  skipReason?: string;
  detectedCount: number;
  stored: Face[];
  notes?: string;
  frameCount?: number;
};

export function resolveFaceDetectionProviderName(): FaceDetectionProviderName {
  const raw = process.env.FACE_DETECTION_PROVIDER?.trim().toLowerCase();
  if (raw && (FACE_DETECTION_PROVIDERS as readonly string[]).includes(raw)) {
    return raw as FaceDetectionProviderName;
  }
  return "rekognition";
}

/**
 * Live detection is used when enabled and the selected provider has credentials.
 * Otherwise the mock provider keeps local flows working.
 */
export function isFaceDetectionEnabled(): boolean {
  if (process.env.FACE_DETECTION_ENABLED !== "true") return false;
  const name = resolveFaceDetectionProviderName();
  if (name === "mock") return false;
  if (name === "rekognition") return isRekognitionFaceDetectionConfigured();
  if (name === "google_vision") return isGoogleVisionFaceDetectionConfigured();
  return false;
}

export function getFaceDetectionProvider(): FaceDetectionProvider {
  if (!isFaceDetectionEnabled()) {
    console.info(`${LOG} using mock provider`, {
      FACE_DETECTION_ENABLED: process.env.FACE_DETECTION_ENABLED ?? "unset",
      configured: resolveFaceDetectionProviderName(),
    });
    return mockFaceDetectionProvider;
  }

  const name = resolveFaceDetectionProviderName();
  switch (name) {
    case "google_vision":
      return googleVisionFaceDetectionProvider;
    case "mock":
      return mockFaceDetectionProvider;
    case "rekognition":
    default:
      return rekognitionFaceDetectionProvider;
  }
}

function assertCleanVisualMedia(row: Media): void {
  if (!isSafeToServe(row.moderationStatus) || row.status !== "ready") {
    throw new FaceDetectionError(
      "policy",
      `Face detection requires clean/ready media (got moderation=${row.moderationStatus}, status=${row.status}).`,
    );
  }
  if (row.type !== "photo" && row.type !== "video") {
    throw new FaceDetectionError(
      "policy",
      "Face detection supports photos and videos only.",
    );
  }
  const ct = row.contentType?.toLowerCase() ?? "";
  if (row.type === "photo" && ct && !ct.startsWith("image/")) {
    throw new FaceDetectionError(
      "policy",
      `Face detection requires an image content type (got ${row.contentType}).`,
    );
  }
  if (row.type === "video" && ct && !ct.startsWith("video/")) {
    throw new FaceDetectionError(
      "policy",
      `Face detection requires a video content type (got ${row.contentType}).`,
    );
  }
}

type ImageBufferSource = {
  buffer: Buffer;
  contentType: string;
  key: string;
  label: string;
  /** Present for video sample frames. */
  sourceFrameMs?: number | null;
};

async function loadPhotoBuffers(row: Media): Promise<ImageBufferSource[]> {
  // Prefer full-res for detection so small faces aren't missed on 480px thumbs.
  // Thumbnail-first caused empty People results → movies fell back to center.
  const key =
    row.processedKey?.trim() ||
    row.originalKey?.trim() ||
    row.thumbnailKey?.trim() ||
    "";
  if (!key) {
    throw new FaceDetectionError("r2", "Missing object key for face detection.");
  }
  const object = await getObjectBytes(key);
  return [
    {
      buffer: object.body,
      contentType: object.contentType ?? row.contentType ?? "image/jpeg",
      key,
      label: "photo",
      sourceFrameMs: null,
    },
  ];
}

async function loadVideoFrameBuffers(row: Media): Promise<{
  sources: ImageBufferSource[];
  errors: string[];
}> {
  const key = row.originalKey || row.processedKey;
  if (!key) {
    throw new FaceDetectionError("r2", "Missing video object key for face detection.");
  }

  const object = await getObjectBytes(key);
  const sampled = await extractVideoSampleFrames(object.body, {
    durationMs: row.durationMs,
    contentType: row.contentType,
    filename: row.originalFilename,
  });

  const sources: ImageBufferSource[] = sampled.frames.map((frame, i) => ({
    buffer: frame.buffer,
    contentType: "image/jpeg",
    key: `${key}#t=${frame.offsetSec.toFixed(2)}`,
    label: `frame-${i}@${frame.offsetSec.toFixed(2)}s`,
    sourceFrameMs: Math.round(frame.offsetSec * 1000),
  }));

  // Last resort: gallery poster if frame extraction failed entirely.
  if (sources.length === 0 && row.thumbnailKey?.trim()) {
    try {
      const thumb = await getObjectBytes(row.thumbnailKey);
      if (thumb.body?.byteLength) {
        sources.push({
          buffer: thumb.body,
          contentType: thumb.contentType ?? "image/jpeg",
          key: row.thumbnailKey,
          label: "thumbnail-fallback",
          sourceFrameMs: null,
        });
      }
    } catch {
      // ignore — empty sources handled by caller
    }
  }

  return { sources, errors: sampled.errors };
}

/**
 * Detect faces on a clean photo or video and store them in `faces`.
 *
 * Errors from the provider are logged and rethrown as FaceDetectionError
 * (callers / workers can retry). Policy skips return `{ skipped: true }`.
 */
export async function detectAndStoreFacesForMedia(
  mediaId: string,
  options: DetectAndStoreFacesOptions = {},
): Promise<DetectAndStoreFacesResult> {
  if (!mediaId?.trim()) {
    throw new FaceDetectionError("input", "mediaId is required.");
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);

  if (!row) {
    throw new FaceDetectionError("input", `Media not found: ${mediaId}`);
  }

  if (options.userId && row.userId !== options.userId) {
    throw new FaceDetectionError("auth", "Media not found.");
  }

  try {
    assertCleanVisualMedia(row);
  } catch (error) {
    const message =
      error instanceof FaceDetectionError
        ? error.message
        : "Media is not eligible for face detection.";
    console.warn(`${LOG} skipped`, { mediaId, reason: message });
    return {
      mediaId,
      provider: "none",
      mock: true,
      skipped: true,
      skipReason: message,
      detectedCount: 0,
      stored: [],
    };
  }

  const existing = await listFacesForMedia(mediaId, row.userId);
  if (existing.length > 0 && !options.replaceExisting) {
    console.info(`${LOG} faces already present — skipping`, {
      mediaId,
      count: existing.length,
    });
    return {
      mediaId,
      provider: "existing",
      mock: false,
      skipped: true,
      skipReason: "Faces already stored for this media.",
      detectedCount: existing.length,
      stored: existing,
    };
  }

  if (existing.length > 0 && options.replaceExisting) {
    const removed = await deleteFacesForMedia(mediaId, row.userId);
    console.info(`${LOG} replaced existing faces`, { mediaId, removed });
  }

  let sources: ImageBufferSource[];
  try {
    if (row.type === "video") {
      const loaded = await loadVideoFrameBuffers(row);
      sources = loaded.sources;
      if (sources.length === 0) {
        console.warn(`${LOG} no frames for video face detection`, {
          mediaId,
          errors: loaded.errors.slice(0, 5),
        });
        return {
          mediaId,
          provider: "none",
          mock: true,
          skipped: true,
          skipReason: "No frames could be extracted from this video.",
          detectedCount: 0,
          stored: [],
          frameCount: 0,
        };
      }
    } else {
      sources = await loadPhotoBuffers(row);
    }
  } catch (error) {
    console.error(`${LOG} failed to load media bytes`, { mediaId, error });
    if (error instanceof FaceDetectionError) throw error;
    throw new FaceDetectionError(
      "r2",
      error instanceof Error
        ? error.message
        : "Failed to load media bytes for face detection.",
      error,
    );
  }

  const provider = options.provider ?? getFaceDetectionProvider();
  console.info(`${LOG} running detector`, {
    mediaId,
    type: row.type,
    provider: provider.name,
    sources: sources.length,
  });

  type PendingDetected = {
    face: DetectedFace;
    sourceFrameMs: number | null;
  };

  const allDetected: PendingDetected[] = [];
  const seenTokens = new Set<string>();
  let lastProviderResult: FaceDetectionProviderResult | null = null;
  const notes: string[] = [];

  for (const source of sources) {
    try {
      const detection = await provider.detectFaces({
        buffer: source.buffer,
        contentType: source.contentType,
        width: row.type === "photo" ? row.width : undefined,
        height: row.type === "photo" ? row.height : undefined,
        key: source.key,
      });
      lastProviderResult = detection;
      for (const face of detection.faces) {
        const token = face.faceToken?.trim();
        if (token) {
          if (seenTokens.has(token)) continue;
          seenTokens.add(token);
        }
        allDetected.push({
          face,
          sourceFrameMs: source.sourceFrameMs ?? null,
        });
      }
      if (detection.notes) notes.push(`${source.label}: ${detection.notes}`);
    } catch (error) {
      console.error(`${LOG} provider failed on source`, {
        mediaId,
        label: source.label,
        provider: provider.name,
        error,
      });
      // For multi-frame video, continue other frames; for single photo, rethrow.
      if (row.type !== "video") {
        if (error instanceof FaceDetectionError) throw error;
        throw new FaceDetectionError(
          "provider",
          error instanceof Error
            ? error.message
            : "Face detection provider failed.",
          error,
        );
      }
      notes.push(
        `${source.label}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (!lastProviderResult && allDetected.length === 0 && row.type === "video") {
    return {
      mediaId,
      provider: provider.name,
      mock: provider.name === "mock",
      skipped: true,
      skipReason: "Face detection failed on all sampled frames.",
      detectedCount: 0,
      stored: [],
      frameCount: sources.length,
      notes: notes.join(" | ") || undefined,
    };
  }

  const stored: Face[] = [];
  for (const pending of allDetected) {
    try {
      const created = await createFace({
        userId: row.userId,
        mediaId,
        boundingBox: pending.face.boundingBox,
        embedding: pending.face.embedding,
        faceToken: pending.face.faceToken,
        confidence: pending.face.confidence,
        provider: lastProviderResult?.provider ?? provider.name,
        sourceFrameMs: pending.sourceFrameMs,
      });
      stored.push(created);
    } catch (error) {
      console.error(`${LOG} failed to persist face`, {
        mediaId,
        error,
        box: pending.face.boundingBox,
      });
      // Continue storing remaining faces; do not abort the whole batch.
    }
  }

  console.info(`${LOG} complete`, {
    mediaId,
    type: row.type,
    provider: lastProviderResult?.provider ?? provider.name,
    mock: lastProviderResult?.mock ?? provider.name === "mock",
    frames: sources.length,
    detected: allDetected.length,
    stored: stored.length,
  });

  return {
    mediaId,
    provider: lastProviderResult?.provider ?? provider.name,
    mock: lastProviderResult?.mock ?? provider.name === "mock",
    skipped: false,
    detectedCount: allDetected.length,
    stored,
    notes: notes.join(" | ") || lastProviderResult?.notes,
    frameCount: row.type === "video" ? sources.length : undefined,
  };
}
