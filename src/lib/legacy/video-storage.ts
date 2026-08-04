import { nanoid } from "nanoid";
import sharp from "sharp";
import {
  contentTypeForLegacyVideoFilename,
  extensionFromLegacyVideoFilename,
  LEGACY_VIDEO_ALLOWED_CONTENT_TYPES,
  LEGACY_VIDEO_MAX_BYTES,
  normalizeLegacyVideoContentType,
  type LegacyVideoAllowedContentType,
} from "@/lib/legacy/video-constants";
import { LogEvents } from "@/lib/observability/events";
import { logger } from "@/lib/observability/logger";
import {
  DEFAULT_UPLOAD_EXPIRES_IN_SECONDS,
  MAX_SIGNED_URL_EXPIRES_IN_SECONDS,
  R2_PREFIXES,
  deleteObject,
  getObjectBytes,
  getR2Bucket,
  getR2Client,
  headObjectMeta,
  moveObject,
  putObjectBytes,
  type PresignedUrlResult,
} from "@/lib/r2";
import {
  PRIVATE_DOCUMENT_DOWNLOAD_MAX_TTL_SECONDS,
  PRIVATE_DOCUMENT_DOWNLOAD_TTL_SECONDS,
} from "@/lib/security/sensitive-access";
import {
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export {
  LEGACY_VIDEO_ALLOWED_CONTENT_TYPES,
  LEGACY_VIDEO_MAX_BYTES,
  contentTypeForLegacyVideoFilename,
  normalizeLegacyVideoContentType,
  type LegacyVideoAllowedContentType,
} from "@/lib/legacy/video-constants";

/* -------------------------------------------------------------------------- */
/* Limits                                                                     */
/* -------------------------------------------------------------------------- */

/** Upload PUT TTL — same window as private documents. */
export const LEGACY_VIDEO_UPLOAD_EXPIRES_IN_SECONDS =
  DEFAULT_UPLOAD_EXPIRES_IN_SECONDS; // 10 minutes

/** Playback GET TTL — same short-lived policy as private document downloads. */
export const LEGACY_VIDEO_PLAYBACK_EXPIRES_IN_SECONDS =
  PRIVATE_DOCUMENT_DOWNLOAD_TTL_SECONDS; // 60s

export const LEGACY_VIDEO_PLAYBACK_MAX_EXPIRES_IN_SECONDS =
  PRIVATE_DOCUMENT_DOWNLOAD_MAX_TTL_SECONDS; // 120s

const THUMB_MAX_EDGE = 480;
const THUMB_JPEG_QUALITY = 72;
/** Skip poster extract for huge files to avoid worker OOM / long jobs. */
const THUMB_MAX_SOURCE_BYTES = 120 * 1024 * 1024;

const ALLOWED_SET = new Set<string>(LEGACY_VIDEO_ALLOWED_CONTENT_TYPES);

export class LegacyVideoStorageError extends Error {
  readonly code: "validation" | "forbidden" | "not_found" | "unsupported";

  constructor(
    message: string,
    code: LegacyVideoStorageError["code"] = "validation",
  ) {
    super(message);
    this.name = "LegacyVideoStorageError";
    this.code = code;
  }
}

/* -------------------------------------------------------------------------- */
/* Key builders                                                               */
/* -------------------------------------------------------------------------- */

function sanitizeFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop()?.trim() || "video";
  return base.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 180);
}

function extensionForContentType(contentType: string): string {
  switch (normalizeLegacyVideoContentType(contentType)) {
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    case "video/x-matroska":
      return "mkv";
    default:
      return "mp4";
  }
}

function assertUserId(userId: string): void {
  if (!userId?.trim()) {
    throw new LegacyVideoStorageError("userId is required.", "validation");
  }
}

function safeKeyPrefix(key: string): string {
  return key.split("/").slice(0, 3).join("/");
}

/** Temp upload key before the video row is committed. */
export function buildLegacyVideoTempKey(input: {
  userId: string;
  filename: string;
  uploadId?: string;
  contentType?: string;
}): string {
  assertUserId(input.userId);
  const uploadId = input.uploadId?.trim() || nanoid();
  const ext =
    extensionFromLegacyVideoFilename(input.filename) ??
    (input.contentType
      ? extensionForContentType(input.contentType)
      : "mp4");
  return `${R2_PREFIXES.privateLegacyVideosTemp}${input.userId}/${uploadId}.${ext}`;
}

/** Permanent object key after promote. */
export function buildLegacyVideoStorageKey(input: {
  userId: string;
  videoId: string;
  filename: string;
}): string {
  assertUserId(input.userId);
  if (!input.videoId?.trim()) {
    throw new LegacyVideoStorageError("videoId is required.", "validation");
  }
  const name = sanitizeFilename(input.filename);
  return `${R2_PREFIXES.privateLegacyVideos}${input.userId}/${input.videoId}/${name}`;
}

/** Optional poster / first-frame thumbnail. */
export function buildLegacyVideoThumbnailKey(
  userId: string,
  videoId: string,
): string {
  assertUserId(userId);
  if (!videoId?.trim()) {
    throw new LegacyVideoStorageError("videoId is required.", "validation");
  }
  return `${R2_PREFIXES.privateLegacyVideos}${userId}/${videoId}/thumb.jpg`;
}

export function isLegacyVideoTempKey(key: string): boolean {
  return key.startsWith(R2_PREFIXES.privateLegacyVideosTemp);
}

export function isLegacyVideoPermanentKey(key: string): boolean {
  return key.startsWith(R2_PREFIXES.privateLegacyVideos);
}

export function isLegacyVideoKeyForUser(key: string, userId: string): boolean {
  const permanent = `${R2_PREFIXES.privateLegacyVideos}${userId}/`;
  const temp = `${R2_PREFIXES.privateLegacyVideosTemp}${userId}/`;
  return key.startsWith(permanent) || key.startsWith(temp);
}

export function assertLegacyVideoKeyForUser(key: string, userId: string): void {
  assertUserId(userId);
  if (!key?.trim()) {
    throw new LegacyVideoStorageError("storage key is required.", "validation");
  }
  if (!isLegacyVideoKeyForUser(key, userId)) {
    throw new LegacyVideoStorageError(
      "Legacy video key must belong to the owning user under private-legacy-videos/.",
      "forbidden",
    );
  }
}

export function assertOwnedLegacyVideoStorageKey(
  key: string,
  userId: string,
): void {
  assertUserId(userId);
  const permanentPrefix = `${R2_PREFIXES.privateLegacyVideos}${userId}/`;
  if (!key.startsWith(permanentPrefix)) {
    throw new LegacyVideoStorageError(
      "Legacy video storage_key must be a permanent private-legacy-videos/ object for this user.",
      "forbidden",
    );
  }
}

function clampLegacyUploadExpires(expiresIn: number): number {
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new LegacyVideoStorageError(
      "expiresIn must be a positive number of seconds.",
    );
  }
  return Math.min(
    Math.floor(expiresIn),
    LEGACY_VIDEO_UPLOAD_EXPIRES_IN_SECONDS,
    MAX_SIGNED_URL_EXPIRES_IN_SECONDS,
  );
}

function clampLegacyPlaybackExpires(expiresIn: number): number {
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new LegacyVideoStorageError(
      "expiresIn must be a positive number of seconds.",
    );
  }
  return Math.min(
    Math.floor(expiresIn),
    LEGACY_VIDEO_PLAYBACK_MAX_EXPIRES_IN_SECONDS,
    MAX_SIGNED_URL_EXPIRES_IN_SECONDS,
  );
}

/* -------------------------------------------------------------------------- */
/* Content-type validation                                                    */
/* -------------------------------------------------------------------------- */

export function assertAllowedLegacyVideoUpload(input: {
  contentType: string;
  sizeBytes?: number;
  filename?: string;
}): LegacyVideoAllowedContentType {
  let normalized = normalizeLegacyVideoContentType(input.contentType);

  // Some browsers send empty/generic types for recordings — fall back to extension.
  if (!ALLOWED_SET.has(normalized) && input.filename) {
    const fromName = contentTypeForLegacyVideoFilename(input.filename);
    if (fromName) normalized = fromName;
  }

  if (!ALLOWED_SET.has(normalized)) {
    throw new LegacyVideoStorageError(
      `Unsupported video type "${input.contentType}". Allowed: MP4, WebM, QuickTime, and Matroska.`,
      "unsupported",
    );
  }

  if (input.sizeBytes !== undefined) {
    if (
      !Number.isFinite(input.sizeBytes) ||
      input.sizeBytes <= 0 ||
      input.sizeBytes > LEGACY_VIDEO_MAX_BYTES
    ) {
      throw new LegacyVideoStorageError(
        `Video must be between 1 byte and ${LEGACY_VIDEO_MAX_BYTES} bytes.`,
        "validation",
      );
    }
  }

  return normalized as LegacyVideoAllowedContentType;
}

/* -------------------------------------------------------------------------- */
/* Signed URLs                                                                */
/* -------------------------------------------------------------------------- */

export type LegacyVideoUploadUrlResult = PresignedUrlResult & {
  contentType: string;
  maxBytes: number;
};

/**
 * Issue a short-lived PUT URL under private-legacy-videos-temp/{userId}/.
 * Never uses the gallery getUploadUrl helper.
 */
export async function getLegacyVideoUploadUrl(input: {
  userId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadId?: string;
  expiresInSeconds?: number;
}): Promise<LegacyVideoUploadUrlResult> {
  assertUserId(input.userId);
  const contentType = assertAllowedLegacyVideoUpload({
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    filename: input.filename,
  });

  const key = buildLegacyVideoTempKey({
    userId: input.userId,
    filename: input.filename,
    uploadId: input.uploadId,
    contentType,
  });
  assertLegacyVideoKeyForUser(key, input.userId);

  const expires = clampLegacyUploadExpires(
    input.expiresInSeconds ?? LEGACY_VIDEO_UPLOAD_EXPIRES_IN_SECONDS,
  );

  const command = new PutObjectCommand({
    Bucket: getR2Bucket(),
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(getR2Client(), command, { expiresIn: expires });

  logger.info(LogEvents.legacyVideoUploadUrlIssued, {
    userId: input.userId,
    contentType,
    sizeBytes: input.sizeBytes,
    keyPrefix: safeKeyPrefix(key),
    expiresIn: expires,
  });

  return {
    url,
    key,
    expiresIn: expires,
    expiresAt: new Date(Date.now() + expires * 1000).toISOString(),
    contentType,
    maxBytes: LEGACY_VIDEO_MAX_BYTES,
  };
}

export type LegacyVideoPlaybackUrlResult = PresignedUrlResult & {
  videoId?: string;
  purpose: "playback" | "thumbnail" | "temp";
};

/**
 * Issue a short-lived GET URL for playback or thumbnail preview.
 * Uses private, no-store cache headers — never a public/unsigned URL.
 */
export async function getLegacyVideoPlaybackUrl(input: {
  userId: string;
  key: string;
  videoId?: string;
  purpose?: "playback" | "thumbnail" | "temp";
  filename?: string;
  contentType?: string;
  expiresInSeconds?: number;
}): Promise<LegacyVideoPlaybackUrlResult> {
  assertLegacyVideoKeyForUser(input.key, input.userId);

  const purpose = input.purpose ?? "playback";
  if (purpose !== "temp") {
    assertOwnedLegacyVideoStorageKey(input.key, input.userId);
  }

  const expires = clampLegacyPlaybackExpires(
    input.expiresInSeconds ?? LEGACY_VIDEO_PLAYBACK_EXPIRES_IN_SECONDS,
  );

  const dispositionFilename = input.filename
    ? sanitizeFilename(input.filename)
    : undefined;

  const command = new GetObjectCommand({
    Bucket: getR2Bucket(),
    Key: input.key,
    ResponseCacheControl: `private, max-age=${expires}, no-store`,
    ...(input.contentType
      ? {
          ResponseContentType: normalizeLegacyVideoContentType(
            input.contentType,
          ),
        }
      : {}),
    ...(dispositionFilename
      ? {
          // inline so <video> / <img> can play without forcing a download
          ResponseContentDisposition: `inline; filename="${dispositionFilename.replace(/"/g, "")}"`,
        }
      : {}),
  });

  const url = await getSignedUrl(getR2Client(), command, { expiresIn: expires });

  logger.info(LogEvents.legacyVideoPlaybackUrlIssued, {
    userId: input.userId,
    videoId: input.videoId,
    purpose,
    keyPrefix: safeKeyPrefix(input.key),
    expiresIn: expires,
  });

  return {
    url,
    key: input.key,
    expiresIn: expires,
    expiresAt: new Date(Date.now() + expires * 1000).toISOString(),
    videoId: input.videoId,
    purpose,
  };
}

/* -------------------------------------------------------------------------- */
/* Promote / finalize                                                         */
/* -------------------------------------------------------------------------- */

export type PromoteLegacyVideoResult = {
  fromKey: string;
  toKey: string;
  contentType?: string;
  sizeBytes: number;
};

/**
 * Move a temp upload into private-legacy-videos/{userId}/{videoId}/…
 * Verifies the object exists and size is within limits.
 */
export async function promoteLegacyVideoTempToPermanent(input: {
  userId: string;
  videoId: string;
  tempKey: string;
  filename: string;
  expectedContentType?: string;
  expectedSizeBytes?: number;
}): Promise<PromoteLegacyVideoResult> {
  assertLegacyVideoKeyForUser(input.tempKey, input.userId);
  if (!isLegacyVideoTempKey(input.tempKey)) {
    throw new LegacyVideoStorageError(
      "promote requires a private-legacy-videos-temp/ source key.",
      "validation",
    );
  }

  const meta = await headObjectMeta(input.tempKey);
  if (!meta) {
    throw new LegacyVideoStorageError(
      "Uploaded video object was not found in storage.",
      "not_found",
    );
  }
  if (meta.contentLength > LEGACY_VIDEO_MAX_BYTES) {
    throw new LegacyVideoStorageError(
      "Uploaded video exceeds the maximum allowed size.",
      "validation",
    );
  }
  if (
    input.expectedSizeBytes != null &&
    meta.contentLength !== input.expectedSizeBytes
  ) {
    throw new LegacyVideoStorageError(
      "Uploaded object size does not match the declared size.",
      "validation",
    );
  }
  if (input.expectedContentType) {
    const expected = normalizeLegacyVideoContentType(input.expectedContentType);
    const actual = normalizeLegacyVideoContentType(meta.contentType ?? "");
    if (actual && actual !== expected) {
      throw new LegacyVideoStorageError(
        "Uploaded object content type does not match the declared type.",
        "validation",
      );
    }
  }

  const toKey = buildLegacyVideoStorageKey({
    userId: input.userId,
    videoId: input.videoId,
    filename: input.filename,
  });
  assertOwnedLegacyVideoStorageKey(toKey, input.userId);

  await moveObject(input.tempKey, toKey);

  logger.info(LogEvents.legacyVideoPromoted, {
    userId: input.userId,
    videoId: input.videoId,
    keyPrefix: safeKeyPrefix(toKey),
    sizeBytes: meta.contentLength,
    contentType: meta.contentType,
  });

  return {
    fromKey: input.tempKey,
    toKey,
    contentType: meta.contentType,
    sizeBytes: meta.contentLength,
  };
}

/* -------------------------------------------------------------------------- */
/* Thumbnail / poster                                                         */
/* -------------------------------------------------------------------------- */

export type LegacyVideoThumbnailResult = {
  thumbnailKey: string | null;
  byteSize: number;
  skipped: boolean;
  reason?: string;
};

function resolveFfmpegPath(): string {
  const fromEnv =
    process.env.FFMPEG_PATH?.trim() || process.env.FFMPEG_BIN?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  try {
    const require = createRequire(import.meta.url);
    const ffmpegStatic = require("ffmpeg-static") as string | null;
    if (ffmpegStatic && existsSync(ffmpegStatic)) return ffmpegStatic;
  } catch {
    // optional
  }
  return "ffmpeg";
}

async function resizePoster(source: Buffer): Promise<Buffer> {
  return sharp(source)
    .rotate()
    .resize({
      width: THUMB_MAX_EDGE,
      height: THUMB_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: THUMB_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

async function extractVideoPoster(source: Buffer): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), "fmv-legacy-thumb-"));
  const inputPath = join(workDir, "input.bin");
  const outputPath = join(workDir, "poster.jpg");
  try {
    await writeFile(inputPath, source);
    const ffmpeg = resolveFfmpegPath();
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        ffmpeg,
        [
          "-y",
          "-ss",
          "0.35",
          "-i",
          inputPath,
          "-frames:v",
          "1",
          "-q:v",
          "4",
          outputPath,
        ],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let stderr = "";
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else {
          reject(
            new Error(
              `ffmpeg poster failed (${code}): ${stderr.slice(-400)}`,
            ),
          );
        }
      });
    });
    const frame = await readFile(outputPath);
    return resizePoster(frame);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Generate a JPEG poster frame when ffmpeg is available.
 * Best-effort: skips (does not throw) when extraction is not possible.
 */
export async function generateLegacyVideoThumbnail(input: {
  userId: string;
  videoId: string;
  storageKey: string;
  contentType?: string;
}): Promise<LegacyVideoThumbnailResult> {
  assertOwnedLegacyVideoStorageKey(input.storageKey, input.userId);

  try {
    const meta = await headObjectMeta(input.storageKey);
    if (meta && meta.contentLength > THUMB_MAX_SOURCE_BYTES) {
      logger.info(LogEvents.legacyVideoThumbnailSkipped, {
        userId: input.userId,
        videoId: input.videoId,
        reason: "source_too_large",
        sizeBytes: meta.contentLength,
      });
      return {
        thumbnailKey: null,
        byteSize: 0,
        skipped: true,
        reason: "source_too_large",
      };
    }
  } catch {
    // Fall through to download attempt; download failure is handled below.
  }

  let body: Buffer;
  try {
    const downloaded = await getObjectBytes(input.storageKey);
    body = downloaded.body;
  } catch (error) {
    logger.warn(LogEvents.legacyVideoThumbnailSkipped, {
      userId: input.userId,
      videoId: input.videoId,
      reason: "download_failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return {
      thumbnailKey: null,
      byteSize: 0,
      skipped: true,
      reason: "download_failed",
    };
  }

  if (!body?.byteLength) {
    return {
      thumbnailKey: null,
      byteSize: 0,
      skipped: true,
      reason: "empty_source",
    };
  }

  if (body.byteLength > THUMB_MAX_SOURCE_BYTES) {
    logger.info(LogEvents.legacyVideoThumbnailSkipped, {
      userId: input.userId,
      videoId: input.videoId,
      reason: "source_too_large",
      sizeBytes: body.byteLength,
    });
    return {
      thumbnailKey: null,
      byteSize: 0,
      skipped: true,
      reason: "source_too_large",
    };
  }

  let jpeg: Buffer;
  try {
    jpeg = await extractVideoPoster(body);
  } catch (error) {
    logger.warn(LogEvents.legacyVideoThumbnailSkipped, {
      userId: input.userId,
      videoId: input.videoId,
      reason: "ffmpeg_failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return {
      thumbnailKey: null,
      byteSize: 0,
      skipped: true,
      reason: "ffmpeg_failed",
    };
  }

  const thumbnailKey = buildLegacyVideoThumbnailKey(input.userId, input.videoId);
  assertOwnedLegacyVideoStorageKey(thumbnailKey, input.userId);

  const uploaded = await putObjectBytes(thumbnailKey, jpeg, {
    contentType: "image/jpeg",
    cacheControl: "private, max-age=31536000, immutable",
  });

  logger.info(LogEvents.legacyVideoThumbnailGenerated, {
    userId: input.userId,
    videoId: input.videoId,
    keyPrefix: safeKeyPrefix(thumbnailKey),
    byteSize: uploaded.byteSize,
  });

  return {
    thumbnailKey,
    byteSize: uploaded.byteSize,
    skipped: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Delete                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Delete a single owned legacy-video object key.
 * Never touches gallery prefixes.
 */
export async function deleteLegacyVideoObject(input: {
  userId: string;
  key: string;
  videoId?: string;
}): Promise<{ deleted: boolean; key: string }> {
  assertLegacyVideoKeyForUser(input.key, input.userId);
  await deleteObject(input.key);

  logger.info(LogEvents.legacyVideoObjectDeleted, {
    userId: input.userId,
    videoId: input.videoId,
    keyPrefix: safeKeyPrefix(input.key),
  });

  return { deleted: true, key: input.key };
}

export type DeleteLegacyVideoObjectsResult = {
  deletedKeys: string[];
};

/** Delete permanent (and optional thumbnail / temp) objects for a legacy video. */
export async function deleteLegacyVideoObjects(input: {
  userId: string;
  videoId?: string;
  storageKey?: string | null;
  thumbnailKey?: string | null;
  tempKey?: string | null;
}): Promise<DeleteLegacyVideoObjectsResult> {
  assertUserId(input.userId);
  const deletedKeys: string[] = [];

  for (const key of [input.storageKey, input.thumbnailKey, input.tempKey]) {
    if (!key?.trim()) continue;
    try {
      await deleteLegacyVideoObject({
        userId: input.userId,
        key,
        videoId: input.videoId,
      });
      deletedKeys.push(key);
    } catch (error) {
      logger.warn("legacy.video_r2_delete_failed", {
        userId: input.userId,
        videoId: input.videoId,
        keyPrefix: safeKeyPrefix(key),
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info(LogEvents.legacyVideoObjectsDeleted, {
    userId: input.userId,
    videoId: input.videoId,
    deletedCount: deletedKeys.length,
  });

  return { deletedKeys };
}

/** Re-export for callers that type signed URL results. */
export type { PresignedUrlResult };
