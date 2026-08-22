/**
 * Rekognition Face Collection identity matching.
 *
 * DetectFaces only finds faces — it does not say who they are.
 * IndexFaces + SearchFacesByImage match the same person across photos.
 */

import {
  CreateCollectionCommand,
  DeleteCollectionCommand,
  DetectFacesCommand,
  IndexFacesCommand,
  ListCollectionsCommand,
  RekognitionClient,
  ResourceAlreadyExistsException,
  ResourceNotFoundException,
  SearchFacesByImageCommand,
  SearchFacesCommand,
} from "@aws-sdk/client-rekognition";
import sharp from "sharp";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { faces, type Face } from "@/lib/db/schema";
import { FaceDetectionError } from "@/lib/faces/providers/types";
import {
  extractVideoFrameAt,
  extractVideoSampleFrames,
} from "@/lib/media/video-frames";
import type { FaceBoundingBox } from "@/lib/people/types";
import { getObjectBytes } from "@/lib/r2";

const LOG = "[faces.rekognition.identity]";

function createClient(): RekognitionClient {
  const region =
    process.env.REKOGNITION_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    process.env.AWS_DEFAULT_REGION?.trim() ||
    "us-east-1";

  const accessKeyId =
    process.env.REKOGNITION_ACCESS_KEY_ID?.trim() ||
    process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey =
    process.env.REKOGNITION_SECRET_ACCESS_KEY?.trim() ||
    process.env.AWS_SECRET_ACCESS_KEY?.trim();

  return new RekognitionClient({
    region,
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  });
}

/** Stable per-user collection id (AWS allows [a-zA-Z0-9_.-]+). */
export function collectionIdForUser(userId: string): string {
  const safe = userId.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 200);
  return `fmv-${safe}`;
}

export function getIdentityMatchThreshold(): number {
  // High bar: padded group-photo crops otherwise false-match neighbors.
  const raw = Number(process.env.FACE_IDENTITY_MATCH_THRESHOLD ?? 95);
  if (!Number.isFinite(raw) || raw < 0 || raw > 100) return 95;
  return raw;
}

export async function ensureFaceCollection(userId: string): Promise<string> {
  const collectionId = collectionIdForUser(userId);
  const client = createClient();
  try {
    await client.send(
      new CreateCollectionCommand({ CollectionId: collectionId }),
    );
    console.info(`${LOG} created collection`, { collectionId });
  } catch (error) {
    if (!(error instanceof ResourceAlreadyExistsException)) {
      throw new FaceDetectionError(
        "rekognition",
        error instanceof Error
          ? error.message
          : "Failed to create Rekognition collection.",
        error,
      );
    }
  }
  return collectionId;
}

/** Wipe and recreate the user's face collection (for full regroup). */
export async function resetFaceCollection(userId: string): Promise<string> {
  const collectionId = collectionIdForUser(userId);
  const client = createClient();
  try {
    await client.send(
      new DeleteCollectionCommand({ CollectionId: collectionId }),
    );
    console.info(`${LOG} deleted collection`, { collectionId });
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) {
      console.warn(`${LOG} delete collection warning`, { error });
    }
  }
  await client.send(
    new CreateCollectionCommand({ CollectionId: collectionId }),
  );
  console.info(`${LOG} recreated collection`, { collectionId });
  return collectionId;
}

export async function collectionExists(userId: string): Promise<boolean> {
  const collectionId = collectionIdForUser(userId);
  const client = createClient();
  const listed = await client.send(new ListCollectionsCommand({}));
  return (listed.CollectionIds ?? []).includes(collectionId);
}

/**
 * Crop a face from a full image with padding (helps SearchFaces).
 */
export async function cropFaceFromImage(
  buffer: Buffer,
  box: FaceBoundingBox,
  paddingRatio = 0.25,
): Promise<Buffer> {
  const image = sharp(buffer).rotate();
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 1 || height < 1) {
    throw new FaceDetectionError("rekognition", "Invalid image dimensions.");
  }

  const padX = box.width * paddingRatio;
  const padY = box.height * paddingRatio;
  const left = Math.max(0, Math.floor((box.x - padX) * width));
  const top = Math.max(0, Math.floor((box.y - padY) * height));
  const right = Math.min(width, Math.ceil((box.x + box.width + padX) * width));
  const bottom = Math.min(
    height,
    Math.ceil((box.y + box.height + padY) * height),
  );
  const extractWidth = Math.max(1, right - left);
  const extractHeight = Math.max(1, bottom - top);

  return image
    .extract({
      left,
      top,
      width: extractWidth,
      height: extractHeight,
    })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

/**
 * Load JPEG/image buffers suitable for cropping this face.
 * Photos: display/thumb/original image.
 * Videos: the stored sample frame (sourceFrameMs), else representative frames.
 */
async function loadCropCandidateImages(face: Face): Promise<Buffer[]> {
  // Face rows are scoped to the viewer (actor); media may be family-shared
  // and owned by a co-member. Never require media.userId === face.userId.
  const { loadCleanAccessibleMediaByIds } = await import("@/lib/media/queries");
  const [row] = await loadCleanAccessibleMediaByIds(face.userId, [face.mediaId]);
  if (!row) {
    throw new FaceDetectionError("input", `Media not found: ${face.mediaId}`);
  }

  if (row.type === "video" || row.contentType?.startsWith("video/")) {
    const key = row.originalKey || row.processedKey;
    if (!key) {
      throw new FaceDetectionError(
        "r2",
        `Missing video object for face crop (${face.mediaId}).`,
      );
    }
    const object = await getObjectBytes(key);
    const sampled = await extractVideoSampleFrames(object.body, {
      durationMs: row.durationMs,
      contentType: row.contentType,
      filename: row.originalFilename,
    });

    const frames = [...sampled.frames];
    if (face.sourceFrameMs != null && face.sourceFrameMs >= 0) {
      // Prefer the frame closest to the detection timestamp.
      frames.sort(
        (a, b) =>
          Math.abs(Math.round(a.offsetSec * 1000) - face.sourceFrameMs!) -
          Math.abs(Math.round(b.offsetSec * 1000) - face.sourceFrameMs!),
      );

      // Also try an exact seek when the closest sample is far off.
      const closestMs = frames[0]
        ? Math.round(frames[0].offsetSec * 1000)
        : null;
      if (
        closestMs == null ||
        Math.abs(closestMs - face.sourceFrameMs) > 200
      ) {
        const exact = await extractVideoFrameAt(
          object.body,
          face.sourceFrameMs / 1000,
          {
            contentType: row.contentType,
            filename: row.originalFilename,
          },
        );
        if (exact?.byteLength) {
          return [exact, ...frames.map((f) => f.buffer)];
        }
      }
    }

    const candidates = frames.map((f) => f.buffer);
    if (candidates.length === 0 && row.thumbnailKey?.trim()) {
      try {
        const thumb = await getObjectBytes(row.thumbnailKey);
        if (thumb.body?.byteLength) candidates.push(thumb.body);
      } catch {
        // ignore
      }
    }

    if (candidates.length === 0) {
      throw new FaceDetectionError(
        "r2",
        `No frames available to crop face ${face.id}.`,
      );
    }
    return candidates;
  }

  const key = row.thumbnailKey || row.processedKey || row.originalKey;
  if (!key) {
    throw new FaceDetectionError(
      "r2",
      `Missing image object for face crop (${face.mediaId}).`,
    );
  }
  const object = await getObjectBytes(key);
  return [object.body];
}

/** Upscale tiny crops so SearchFaces/IndexFaces can detect a face. */
async function ensureSearchableCrop(crop: Buffer): Promise<Buffer> {
  const meta = await sharp(crop).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const minSide = Math.min(width, height);
  if (minSide >= 80) return crop;

  const scale = 80 / Math.max(minSide, 1);
  return sharp(crop)
    .resize({
      width: Math.max(1, Math.ceil(width * scale)),
      height: Math.max(1, Math.ceil(height * scale)),
      kernel: "lanczos3",
    })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

async function tryCropFromBuffer(
  buffer: Buffer,
  box: FaceBoundingBox,
): Promise<Buffer | null> {
  const paddings = [0.08, 0.16, 0.28];
  let last: Buffer | null = null;
  for (const pad of paddings) {
    try {
      last = await cropFaceFromImage(buffer, box, pad);
      const meta = await sharp(last).metadata();
      if ((meta.width ?? 0) >= 40 && (meta.height ?? 0) >= 40) {
        const isolated = await isolatePrimaryFaceInCrop(last);
        return ensureSearchableCrop(isolated);
      }
    } catch {
      // try next padding / buffer
    }
  }
  if (!last) return null;
  try {
    const isolated = await isolatePrimaryFaceInCrop(last);
    return ensureSearchableCrop(isolated);
  } catch {
    return null;
  }
}

/**
 * Build a tight face crop for identity matching.
 * Avoid large padding — neighboring faces in group photos cause false matches.
 * For videos, crop from the detection sample frame (or try other samples).
 */
export async function cropFaceRecord(face: Face): Promise<Buffer> {
  const candidates = await loadCropCandidateImages(face);
  let lastError: unknown = null;

  for (const buffer of candidates) {
    try {
      const crop = await tryCropFromBuffer(buffer, face.boundingBox);
      if (crop) return crop;
    } catch (error) {
      lastError = error;
    }
  }

  throw new FaceDetectionError(
    "rekognition",
    lastError instanceof Error
      ? lastError.message
      : "Failed to crop face from media.",
    lastError,
  );
}

export type IdentitySearchHit = {
  matchedFaceId: string;
  similarity: number;
  rekognitionFaceId: string;
};

/**
 * Search the user's collection for a face crop.
 * matchedFaceId is our faces.id (ExternalImageId).
 */
export async function searchIdentityByCrop(
  userId: string,
  crop: Buffer,
  threshold = getIdentityMatchThreshold(),
): Promise<IdentitySearchHit | null> {
  const collectionId = await ensureFaceCollection(userId);
  const client = createClient();

  try {
    const response = await client.send(
      new SearchFacesByImageCommand({
        CollectionId: collectionId,
        Image: { Bytes: crop },
        FaceMatchThreshold: threshold,
        MaxFaces: 1,
      }),
    );

    const match = response.FaceMatches?.[0];
    const externalId = match?.Face?.ExternalImageId;
    const similarity = match?.Similarity;
    const rekognitionFaceId = match?.Face?.FaceId;
    if (!externalId || similarity == null || !rekognitionFaceId) {
      return null;
    }

    return {
      matchedFaceId: externalId,
      similarity,
      rekognitionFaceId,
    };
  } catch (error) {
    // Empty collection / no faces in image → treat as no match.
    const message = (
      error instanceof Error ? error.message : String(error)
    ).toLowerCase();
    if (
      message.includes("there are no faces in the image") ||
      message.includes("invalidparameterexception") ||
      message.includes("nofaceexception")
    ) {
      return null;
    }
    throw new FaceDetectionError(
      "rekognition",
      (error instanceof Error ? error.message : String(error)) ||
        "SearchFacesByImage failed.",
      error,
    );
  }
}

/**
 * Index a face crop into the user's collection. ExternalImageId = our face row id.
 */
export async function indexFaceIdentity(
  userId: string,
  face: Face,
  crop: Buffer,
): Promise<string | null> {
  const collectionId = await ensureFaceCollection(userId);
  const client = createClient();

  const response = await client.send(
    new IndexFacesCommand({
      CollectionId: collectionId,
      Image: { Bytes: crop },
      ExternalImageId: face.id,
      MaxFaces: 1,
      // NONE so low-quality / small faces still enter the collection for matching.
      QualityFilter: "NONE",
      DetectionAttributes: [],
    }),
  );

  const rekognitionFaceId = response.FaceRecords?.[0]?.Face?.FaceId ?? null;
  if (rekognitionFaceId) {
    const db = getDb();
    await db
      .update(faces)
      .set({ faceToken: rekognitionFaceId, provider: "rekognition.identity" })
      .where(and(eq(faces.id, face.id), eq(faces.userId, userId)));
  }

  console.info(`${LOG} indexed face`, {
    faceId: face.id,
    rekognitionFaceId,
    collectionId,
  });

  return rekognitionFaceId;
}

/**
 * Find other indexed faces in the collection that match this Rekognition FaceId.
 */
export async function searchIdentityByFaceId(
  userId: string,
  rekognitionFaceId: string,
  threshold = getIdentityMatchThreshold(),
): Promise<IdentitySearchHit[]> {
  const collectionId = await ensureFaceCollection(userId);
  const client = createClient();

  try {
    const response = await client.send(
      new SearchFacesCommand({
        CollectionId: collectionId,
        FaceId: rekognitionFaceId,
        FaceMatchThreshold: threshold,
        MaxFaces: 20,
      }),
    );

    const hits: IdentitySearchHit[] = [];
    for (const match of response.FaceMatches ?? []) {
      const externalId = match.Face?.ExternalImageId;
      const similarity = match.Similarity;
      const faceId = match.Face?.FaceId;
      if (!externalId || similarity == null || !faceId) continue;
      hits.push({
        matchedFaceId: externalId,
        similarity,
        rekognitionFaceId: faceId,
      });
    }
    return hits;
  } catch (error) {
    const message = (
      error instanceof Error ? error.message : String(error)
    ).toLowerCase();
    if (
      message.includes("invalidparameterexception") ||
      message.includes("resource not found")
    ) {
      return [];
    }
    throw new FaceDetectionError(
      "rekognition",
      (error instanceof Error ? error.message : String(error)) ||
        "SearchFaces failed.",
      error,
    );
  }
}

/**
 * If a crop accidentally includes multiple faces (common in group photos),
 * re-crop to the largest face nearest the center so Search/Index match the
 * intended person — not a neighbor.
 */
async function isolatePrimaryFaceInCrop(crop: Buffer): Promise<Buffer> {
  const client = createClient();
  let details;
  try {
    const response = await client.send(
      new DetectFacesCommand({
        Image: { Bytes: crop },
        Attributes: ["DEFAULT"],
      }),
    );
    details = response.FaceDetails ?? [];
  } catch {
    return crop;
  }

  if (details.length <= 1) return crop;

  const meta = await sharp(crop).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 1 || height < 1) return crop;

  let best: {
    score: number;
    left: number;
    top: number;
    width: number;
    height: number;
  } | null = null;

  for (const detail of details) {
    const box = detail.BoundingBox;
    if (
      box?.Left == null ||
      box.Top == null ||
      box.Width == null ||
      box.Height == null
    ) {
      continue;
    }
    const cx = box.Left + box.Width / 2;
    const cy = box.Top + box.Height / 2;
    const centerDist = Math.hypot(cx - 0.5, cy - 0.5);
    const area = box.Width * box.Height;
    // Prefer large, centered faces.
    const score = area * 2 - centerDist;
    if (!best || score > best.score) {
      best = {
        score,
        left: box.Left,
        top: box.Top,
        width: box.Width,
        height: box.Height,
      };
    }
  }

  if (!best) return crop;

  // Small pad around the chosen face only.
  const pad = 0.08;
  const left = Math.max(0, Math.floor((best.left - best.width * pad) * width));
  const top = Math.max(0, Math.floor((best.top - best.height * pad) * height));
  const right = Math.min(
    width,
    Math.ceil((best.left + best.width * (1 + pad)) * width),
  );
  const bottom = Math.min(
    height,
    Math.ceil((best.top + best.height * (1 + pad)) * height),
  );

  return sharp(crop)
    .extract({
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    })
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}
