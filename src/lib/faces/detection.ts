/**
 * Face detection service.
 *
 * Runs a pluggable detector on clean photo or video media, then persists rows
 * into `faces` linked to that media. Videos are sampled via ffmpeg frames.
 *
 * Face rows are scoped to an *actor* userId (the People graph owner). For
 * owned media the actor is the media owner; for shared family media the actor
 * is the family viewer so matches land on that viewer's People.
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
  /**
   * Actor whose People graph receives face rows.
   * Must be able to view the media (owner or family). Defaults to media owner.
   */
  userId?: string;
  /**
   * If faces already exist for this actor+media:
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
      "Media must be clean and ready for face detection.",
    );
  }
  if (row.type !== "photo" && row.type !== "video") {
    throw new FaceDetectionError(
      "policy",
      "Face detection only runs on photos or videos.",
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

async function loadVideoFrameBuffers(
  row: Media,
): Promise<{ sources: ImageBufferSource[]; errors: string[] }> {
  const key = row.originalKey || row.processedKey;
  if (!key) {
    throw new FaceDetectionError(
      "r2",
      "Missing video object key for face detection.",
    );
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
 * Copy owner-detected face geometry/embeddings into the actor's face rows
 * (without personId — grouping matches against the actor's People).
 * Does not copy faceToken (provider collections are per-user).
 */
async function reuseOwnerFacesForActor(
  mediaId: string,
  ownerUserId: string,
  actorUserId: string,
): Promise<Face[]> {
  const ownerFaces = await listFacesForMedia(mediaId, ownerUserId);
  if (ownerFaces.length === 0) return [];

  const stored: Face[] = [];
  for (const ownerFace of ownerFaces) {
    try {
      const created = await createFace({
        userId: actorUserId,
        mediaId,
        boundingBox: ownerFace.boundingBox,
        embedding: ownerFace.embedding,
        // Intentionally omit faceToken — identity collections are per actor.
        confidence: ownerFace.confidence,
        provider: ownerFace.provider
          ? `reuse:${ownerFace.provider}`
          : "reuse",
        sourceFrameMs: ownerFace.sourceFrameMs,
      });
      stored.push(created);
    } catch (error) {
      console.error(`${LOG} failed to reuse owner face`, {
        mediaId,
        ownerFaceId: ownerFace.id,
        actorUserId,
        error,
      });
    }
  }
  return stored;
}

/**
 * Detect faces on clean media and store rows for the actor's People graph.
 * Policy skips return `{ skipped: true }` (callers / workers can retry).
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

  const actorUserId = options.userId?.trim() || row.userId;

  if (options.userId) {
    const { canViewMedia } = await import("@/lib/permissions");
    if (!(await canViewMedia(actorUserId, mediaId))) {
      throw new FaceDetectionError("auth", "Media not found.");
    }
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

  const existing = await listFacesForMedia(mediaId, actorUserId);
  if (existing.length > 0 && !options.replaceExisting) {
    console.info(`${LOG} faces already present — skipping`, {
      mediaId,
      actorUserId,
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
    const removed = await deleteFacesForMedia(mediaId, actorUserId);
    console.info(`${LOG} replaced existing faces`, {
      mediaId,
      actorUserId,
      removed,
    });
  }

  // Shared media: reuse owner detections when available (boxes + embeddings).
  if (actorUserId !== row.userId) {
    const reused = await reuseOwnerFacesForActor(
      mediaId,
      row.userId,
      actorUserId,
    );
    if (reused.length > 0) {
      console.info(`${LOG} reused owner faces for family viewer`, {
        mediaId,
        actorUserId,
        ownerUserId: row.userId,
        count: reused.length,
      });
      return {
        mediaId,
        provider: "reuse",
        mock: false,
        skipped: false,
        detectedCount: reused.length,
        stored: reused,
        notes: "Reused owner face detections for family viewer.",
      };
    }
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
    actorUserId,
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
        userId: actorUserId,
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
        actorUserId,
        error,
        box: pending.face.boundingBox,
      });
      // Continue storing remaining faces; do not abort the whole batch.
    }
  }

  console.info(`${LOG} complete`, {
    mediaId,
    actorUserId,
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
    frameCount: sources.length,
    notes: notes.join(" | ") || undefined,
  };
}
