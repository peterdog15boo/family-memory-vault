/**
 * Purpose-based signed URLs for gallery media (thumbnail / display / original).
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { media, type Media } from "@/lib/db/schema";
import { canViewMedia } from "@/lib/permissions";
import { maybeGenerateDisplayForMedia } from "@/lib/media/thumbnails";
import { maybeGenerateVideoPlaybackProxy } from "@/lib/media/video-playback";
import {
  DEFAULT_DOWNLOAD_EXPIRES_IN_SECONDS,
  MAX_SIGNED_URL_EXPIRES_IN_SECONDS,
  getDownloadUrl,
  isMediaPlaybackKey,
} from "@/lib/r2";

export type MediaDownloadPurpose = "thumbnail" | "display" | "original";

export type MediaDownloadUrlResult = {
  url: string;
  expiresAt: string;
  expiresIn: number;
  purpose: MediaDownloadPurpose;
  contentType: string;
  /** True when display fell back to original (no processedKey yet). */
  fallbackToOriginal?: boolean;
};

function isVideoRow(row: Pick<Media, "type" | "contentType">): boolean {
  return row.type === "video" || Boolean(row.contentType?.startsWith("video/"));
}

/**
 * Resolve which R2 key to sign for a viewer purpose.
 * - thumbnail → thumbnailKey (grid/list cards only — never lightbox/slideshow)
 * - display → photo: processed JPEG || original; video: playback MP4 || original
 * - original → originalKey (download / archive)
 */
export function resolveMediaObjectKey(
  row: Pick<
    Media,
    "type" | "contentType" | "thumbnailKey" | "processedKey" | "originalKey"
  >,
  purpose: MediaDownloadPurpose,
): { key: string; contentType: string; fallbackToOriginal?: boolean } | null {
  if (purpose === "thumbnail") {
    if (!row.thumbnailKey?.trim()) return null;
    return { key: row.thumbnailKey, contentType: "image/jpeg" };
  }

  if (purpose === "original") {
    return {
      key: row.originalKey,
      contentType: row.contentType || "application/octet-stream",
    };
  }

  // display
  if (isVideoRow(row)) {
    if (isMediaPlaybackKey(row.processedKey)) {
      return {
        key: row.processedKey!,
        contentType: "video/mp4",
      };
    }
    return {
      key: row.originalKey,
      contentType: row.contentType || "video/mp4",
      fallbackToOriginal: true,
    };
  }

  if (row.processedKey?.trim() && !isMediaPlaybackKey(row.processedKey)) {
    return {
      key: row.processedKey,
      contentType: "image/jpeg",
    };
  }

  return {
    key: row.originalKey,
    contentType: row.contentType || "image/jpeg",
    fallbackToOriginal: true,
  };
}

/**
 * Issue a short-lived signed URL for an accessible clean/ready media object.
 */
export async function createMediaDownloadUrl(options: {
  userId: string;
  mediaId: string;
  purpose: MediaDownloadPurpose;
  expiresInSeconds?: number;
}): Promise<MediaDownloadUrlResult | null> {
  const allowed = await canViewMedia(options.userId, options.mediaId);
  if (!allowed) return null;

  const db = getDb();
  const [row] = await db
    .select()
    .from(media)
    .where(
      and(
        eq(media.id, options.mediaId),
        eq(media.moderationStatus, "clean"),
        eq(media.status, "ready"),
      ),
    )
    .limit(1);

  if (!row) return null;

  const resolved = resolveMediaObjectKey(row, options.purpose);
  if (!resolved) return null;

  // Opportunistically backfill display JPEGs for older photos.
  if (
    options.purpose === "display" &&
    resolved.fallbackToOriginal &&
    !isVideoRow(row)
  ) {
    void maybeGenerateDisplayForMedia(row);
  }

  // Kick off ≤1080p playback proxy while falling back to the original.
  if (
    options.purpose === "display" &&
    resolved.fallbackToOriginal &&
    isVideoRow(row)
  ) {
    void maybeGenerateVideoPlaybackProxy(row);
  }

  const defaultExpires = isVideoRow(row)
    ? Math.min(60 * 60, MAX_SIGNED_URL_EXPIRES_IN_SECONDS)
    : DEFAULT_DOWNLOAD_EXPIRES_IN_SECONDS;
  const expiresIn = options.expiresInSeconds ?? defaultExpires;
  const signed = await getDownloadUrl(resolved.key, expiresIn, {
    moderationStatus: "clean",
    mediaStatus: row.status,
  });

  return {
    url: signed.url,
    expiresAt: signed.expiresAt,
    expiresIn: signed.expiresIn,
    purpose: options.purpose,
    contentType: resolved.contentType,
    fallbackToOriginal: resolved.fallbackToOriginal,
  };
}
