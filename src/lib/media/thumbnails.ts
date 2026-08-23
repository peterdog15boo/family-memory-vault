/**
 * Media image derivatives:
 * - thumbnail (480px) → grids
 * - display (2048px) → lightbox / slideshow (photos)
 * - playback MP4 (≤1080p) → lightbox / slideshow (videos) via processedKey
 * - original → download / archive
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { getDb } from "@/lib/db";
import { media, type Media } from "@/lib/db/schema";
import {
  guessVideoExtension,
  parseFfmpegDurationSec,
  resolveFfmpegPath,
  runFfmpeg,
  runFfmpegCapture,
} from "@/lib/media/ffmpeg";
import { pickVideoPosterSeekSec } from "@/lib/media/video-poster-seek";
import { isSafeToServe } from "@/lib/moderation/types";
import {
  buildMediaDisplayKey,
  buildMediaThumbnailKey,
  downloadObjectToFile,
  getObjectBytes,
  putObjectBytes,
} from "@/lib/r2";

const LOG = "[media.thumbnails]";

/** Long edge for gallery thumbs — small enough for fast grids. */
export const THUMBNAIL_MAX_EDGE = 480;
export const THUMBNAIL_JPEG_QUALITY = 72;

/** Long edge for lightbox / slideshow — sharp without shipping multi‑MB originals. */
export const DISPLAY_MAX_EDGE = 2048;
export const DISPLAY_JPEG_QUALITY = 85;

export type GenerateThumbnailResult = {
  mediaId: string;
  thumbnailKey: string;
  displayKey?: string | null;
  byteSize: number;
  skipped?: boolean;
  reason?: string;
};

/**
 * Create grid thumbnail (+ photo display JPEG) for a clean/ready media row.
 * Idempotent when thumbnailKey already set (unless force).
 */
export async function generateAndStoreThumbnail(
  mediaId: string,
  options?: { force?: boolean },
): Promise<GenerateThumbnailResult> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);

  if (!row) {
    throw new Error(`generateAndStoreThumbnail: media not found (${mediaId})`);
  }

  if (!isSafeToServe(row.moderationStatus) || row.status !== "ready") {
    return {
      mediaId,
      thumbnailKey: row.thumbnailKey ?? "",
      displayKey: row.processedKey,
      byteSize: 0,
      skipped: true,
      reason: "not_clean_ready",
    };
  }

  if (row.thumbnailKey?.trim() && !options?.force) {
    // Backfill display JPEG for older photo rows that only have a thumb.
    if (
      row.type === "photo" &&
      !row.processedKey?.trim() &&
      !row.contentType?.startsWith("video/")
    ) {
      void maybeGenerateDisplayForMedia(row).catch(() => undefined);
    }
    return {
      mediaId,
      thumbnailKey: row.thumbnailKey,
      displayKey: row.processedKey,
      byteSize: 0,
      skipped: true,
      reason: "already_has_thumbnail",
    };
  }

  const sourceKey = row.originalKey || row.processedKey;
  if (!sourceKey?.trim()) {
    return {
      mediaId,
      thumbnailKey: "",
      byteSize: 0,
      skipped: true,
      reason: "missing_source",
    };
  }

  const isVideo = row.type === "video" || row.contentType?.startsWith("video/");
  let jpeg: Buffer;
  let displayJpeg: Buffer | null = null;

  if (isVideo) {
    jpeg = await extractVideoPosterFromKey(sourceKey, {
      contentType: row.contentType,
      filename: row.originalFilename,
      byteSize: row.byteSize,
    });
  } else {
    const { body } = await getObjectBytes(sourceKey);
    if (!body?.byteLength) {
      throw new Error(`Empty source object for media ${mediaId}`);
    }
    const { ensureJpegForProcessing } = await import("@/lib/media/decode-image");
    const decoded = await ensureJpegForProcessing(body, {
      contentType: row.contentType,
      filename: row.originalFilename,
    });
    jpeg = await resizePhotoJpeg(
      decoded.buffer,
      THUMBNAIL_MAX_EDGE,
      THUMBNAIL_JPEG_QUALITY,
    );
    displayJpeg = await resizePhotoJpeg(
      decoded.buffer,
      DISPLAY_MAX_EDGE,
      DISPLAY_JPEG_QUALITY,
    );
  }

  const thumbnailKey = buildMediaThumbnailKey(row.userId, row.id);
  const uploaded = await putObjectBytes(thumbnailKey, jpeg, {
    contentType: "image/jpeg",
    cacheControl: "private, max-age=31536000, immutable",
  });

  let displayKey: string | null = row.processedKey;
  if (displayJpeg) {
    displayKey = buildMediaDisplayKey(row.userId, row.id);
    await putObjectBytes(displayKey, displayJpeg, {
      contentType: "image/jpeg",
      cacheControl: "private, max-age=31536000, immutable",
    });
  }

  await db
    .update(media)
    .set({
      thumbnailKey,
      ...(displayKey ? { processedKey: displayKey } : {}),
      updatedAt: new Date(),
    })
    .where(eq(media.id, mediaId));

  console.info(`${LOG} stored`, {
    mediaId,
    thumbnailKey,
    displayKey,
    byteSize: uploaded.byteSize,
    type: row.type,
  });

  return {
    mediaId,
    thumbnailKey,
    displayKey,
    byteSize: uploaded.byteSize,
  };
}

async function resizePhotoJpeg(
  source: Buffer,
  maxEdge: number,
  quality: number,
): Promise<Buffer> {
  return sharp(source)
    .rotate() // honor EXIF orientation
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

/** Stream large videos to disk; keep small clips in-memory for speed. */
const VIDEO_POSTER_STREAM_THRESHOLD = 40 * 1024 * 1024;

async function extractVideoPosterFromKey(
  sourceKey: string,
  options?: {
    contentType?: string | null;
    filename?: string | null;
    byteSize?: number | null;
  },
): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), "fmv-thumb-"));
  const ext = guessVideoExtension(options?.contentType, options?.filename);
  const inputPath = join(workDir, `input.${ext}`);
  const outputPath = join(workDir, "poster.jpg");

  try {
    const size = options?.byteSize ?? 0;
    if (size > VIDEO_POSTER_STREAM_THRESHOLD) {
      await downloadObjectToFile(sourceKey, inputPath);
    } else {
      const { body } = await getObjectBytes(sourceKey);
      if (!body?.byteLength) {
        throw new Error(`Empty source object for poster (${sourceKey})`);
      }
      await writeFile(inputPath, body);
    }

    return await extractVideoPosterFromFile(inputPath, outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function extractVideoPosterFromFile(
  inputPath: string,
  outputPath: string,
): Promise<Buffer> {
  const ffmpeg = resolveFfmpegPath();

  let durationSec: number | null = null;
  try {
    const probed = await runFfmpegCapture(ffmpeg, ["-i", inputPath]);
    durationSec = parseFfmpegDurationSec(probed.stderr);
  } catch {
    durationSec = null;
  }

  const seekSec = pickVideoPosterSeekSec(durationSec);
  const seek = seekSec.toFixed(2);

  console.info(`${LOG} video poster seek`, {
    seekSec: seek,
    durationSec,
  });

  // Accurate post-demux seek first (better for HEVC/MOV), then input seek fallback.
  const attempts: string[][] = [
    [
      "-y",
      "-i",
      inputPath,
      "-ss",
      seek,
      "-frames:v",
      "1",
      "-an",
      "-q:v",
      "3",
      outputPath,
    ],
    [
      "-y",
      "-ss",
      seek,
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-an",
      "-q:v",
      "4",
      outputPath,
    ],
    // Last resort: slightly earlier than mid if mid fails on short files.
    [
      "-y",
      "-ss",
      "2",
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-an",
      "-q:v",
      "4",
      outputPath,
    ],
  ];

  let lastError: Error | null = null;
  for (const args of attempts) {
    try {
      await runFfmpeg(ffmpeg, args);
      lastError = null;
      break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  if (lastError) throw lastError;

  const frame = await readFile(outputPath);
  return resizePhotoJpeg(frame, THUMBNAIL_MAX_EDGE, THUMBNAIL_JPEG_QUALITY);
}

/** Best-effort — never throws into moderation/face pipelines. */
export async function maybeGenerateThumbnailForMedia(
  row: Pick<Media, "id" | "status" | "moderationStatus" | "thumbnailKey">,
): Promise<void> {
  try {
    if (!isSafeToServe(row.moderationStatus) || row.status !== "ready") {
      console.info(`${LOG} skip — not clean/ready`, {
        mediaId: row.id,
        status: row.status,
        moderationStatus: row.moderationStatus,
      });
      return;
    }
    if (row.thumbnailKey?.trim()) return;
    const result = await generateAndStoreThumbnail(row.id);
    if (result.skipped) {
      console.warn(`${LOG} skipped`, {
        mediaId: row.id,
        reason: result.reason,
      });
    }
  } catch (error) {
    console.error(`${LOG} maybeGenerate failed`, {
      mediaId: row.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Backfill a display JPEG into processedKey for photos that only have a thumb.
 */
export async function maybeGenerateDisplayForMedia(
  row: Pick<
    Media,
    | "id"
    | "userId"
    | "type"
    | "contentType"
    | "status"
    | "moderationStatus"
    | "originalKey"
    | "processedKey"
  >,
): Promise<void> {
  try {
    if (!isSafeToServe(row.moderationStatus) || row.status !== "ready") return;
    if (row.type === "video" || row.contentType?.startsWith("video/")) return;
    if (row.processedKey?.trim()) return;
    if (!row.originalKey?.trim()) return;

    const { body } = await getObjectBytes(row.originalKey);
    if (!body?.byteLength) return;

    const displayJpeg = await resizePhotoJpeg(
      body,
      DISPLAY_MAX_EDGE,
      DISPLAY_JPEG_QUALITY,
    );
    const displayKey = buildMediaDisplayKey(row.userId, row.id);
    await putObjectBytes(displayKey, displayJpeg, {
      contentType: "image/jpeg",
      cacheControl: "private, max-age=31536000, immutable",
    });

    const db = getDb();
    await db
      .update(media)
      .set({ processedKey: displayKey, updatedAt: new Date() })
      .where(eq(media.id, row.id));

    console.info(`${LOG} display backfill`, { mediaId: row.id, displayKey });
  } catch (error) {
    console.error(`${LOG} maybeGenerateDisplay failed`, {
      mediaId: row.id,
      error,
    });
  }
}
