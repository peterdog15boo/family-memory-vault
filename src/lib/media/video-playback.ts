/**
 * Web playback derivatives for gallery videos.
 *
 * Uploaded phone / camera originals are often 4K HEVC multi‑GB files that
 * stutter when streamed progressively. After moderation marks a video clean,
 * we encode a ≤1080p H.264 + AAC MP4 with faststart for in-app playback.
 * Downloads still use the untouched original.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { media, type Media } from "@/lib/db/schema";
import {
  guessVideoExtension,
  resolveFfmpegPath,
  runFfmpeg,
} from "@/lib/media/ffmpeg";
import { isSafeToServe } from "@/lib/moderation/types";
import {
  downloadObjectToFile,
  putObjectFromFile,
} from "@/lib/r2-fs";
import {
  buildMediaPlaybackKey,
  isMediaPlaybackKey,
} from "@/lib/r2";

const LOG = "[media.video-playback]";

/** Long edge cap for in-app progressive playback. */
export const PLAYBACK_MAX_EDGE = 1920;
export const PLAYBACK_MAX_HEIGHT = 1080;

export type GenerateVideoPlaybackResult = {
  mediaId: string;
  playbackKey: string;
  byteSize: number;
  skipped?: boolean;
  reason?: string;
};

/**
 * Encode and store a web-friendly playback MP4 on processedKey.
 * Idempotent when a playback key is already present (unless force).
 */
export async function generateAndStoreVideoPlaybackProxy(
  mediaId: string,
  options?: { force?: boolean },
): Promise<GenerateVideoPlaybackResult> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);

  if (!row) {
    throw new Error(
      `generateAndStoreVideoPlaybackProxy: media not found (${mediaId})`,
    );
  }

  if (!isSafeToServe(row.moderationStatus) || row.status !== "ready") {
    return {
      mediaId,
      playbackKey: row.processedKey ?? "",
      byteSize: 0,
      skipped: true,
      reason: "not_clean_ready",
    };
  }

  const isVideo = row.type === "video" || row.contentType?.startsWith("video/");
  if (!isVideo) {
    return {
      mediaId,
      playbackKey: "",
      byteSize: 0,
      skipped: true,
      reason: "not_video",
    };
  }

  if (isMediaPlaybackKey(row.processedKey) && !options?.force) {
    return {
      mediaId,
      playbackKey: row.processedKey!,
      byteSize: 0,
      skipped: true,
      reason: "already_has_playback",
    };
  }

  if (!row.originalKey?.trim()) {
    return {
      mediaId,
      playbackKey: "",
      byteSize: 0,
      skipped: true,
      reason: "missing_source",
    };
  }

  const workDir = await mkdtemp(join(tmpdir(), "fmv-playback-"));
  const ext = guessVideoExtension(row.contentType, row.originalFilename);
  const inputPath = join(workDir, `input.${ext}`);
  const outputPath = join(workDir, "playback.mp4");

  try {
    console.info(`${LOG} downloading source`, {
      mediaId,
      key: row.originalKey,
      byteSize: row.byteSize,
    });
    await downloadObjectToFile(row.originalKey, inputPath);

    const ffmpeg = resolveFfmpegPath();
    // Scale so the long edge ≤ 1920 and height ≤ 1080, keep AR, yuv420p for browsers.
    const vf =
      "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease," +
      "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p";

    await runFfmpeg(ffmpeg, [
      "-y",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-vf",
      vf,
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      "-sn",
      outputPath,
    ]);

    const playbackKey = buildMediaPlaybackKey(row.userId, row.id);
    const uploaded = await putObjectFromFile(playbackKey, outputPath, {
      contentType: "video/mp4",
      cacheControl: "private, max-age=31536000, immutable",
    });

    await db
      .update(media)
      .set({
        processedKey: playbackKey,
        updatedAt: new Date(),
      })
      .where(eq(media.id, mediaId));

    console.info(`${LOG} stored`, {
      mediaId,
      playbackKey,
      byteSize: uploaded.byteSize,
      sourceBytes: row.byteSize,
    });

    return {
      mediaId,
      playbackKey,
      byteSize: uploaded.byteSize,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Best-effort — never throws into moderation pipelines. */
export async function maybeGenerateVideoPlaybackProxy(
  row: Pick<Media, "id" | "type" | "contentType" | "status" | "moderationStatus" | "processedKey">,
): Promise<void> {
  try {
    const isVideo = row.type === "video" || row.contentType?.startsWith("video/");
    if (!isVideo) return;
    if (!isSafeToServe(row.moderationStatus) || row.status !== "ready") return;
    if (isMediaPlaybackKey(row.processedKey)) return;

    const result = await generateAndStoreVideoPlaybackProxy(row.id);
    if (result.skipped) {
      console.info(`${LOG} skipped`, {
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
