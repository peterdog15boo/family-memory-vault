/**
 * Shared issuance of short-lived signed URLs for Digital Legacy videos.
 * Used by owner and emergency-grantee playback routes.
 */

import type { LegacyVideo } from "@/lib/db/schema";
import { getLegacyVideoPlaybackUrl } from "@/lib/legacy/video-storage";
import {
  logSensitiveAccess,
  type SensitiveAccessAction,
} from "@/lib/security/sensitive-access";

export type LegacyVideoMediaPurpose = "playback" | "thumbnail";

export type LegacyVideoMediaUrls = {
  purpose: LegacyVideoMediaPurpose;
  playbackUrl: string | null;
  thumbnailUrl: string | null;
  expiresAt: string;
  expiresIn: number;
  contentType: string;
  title: string;
  videoId: string;
};

async function signThumbnail(
  video: LegacyVideo,
): Promise<{ url: string; expiresAt: string; expiresIn: number } | null> {
  if (!video.thumbnailKey?.trim()) return null;
  try {
    const thumb = await getLegacyVideoPlaybackUrl({
      userId: video.userId,
      key: video.thumbnailKey,
      videoId: video.id,
      purpose: "thumbnail",
      filename: "thumb.jpg",
      contentType: "image/jpeg",
    });
    return {
      url: thumb.url,
      expiresAt: thumb.expiresAt,
      expiresIn: thumb.expiresIn,
    };
  } catch {
    return null;
  }
}

/**
 * Issue short-lived media URLs for a legacy video row.
 * - purpose "thumbnail": poster only (never signs the video object)
 * - purpose "playback": video URL + optional poster for the player
 */
export async function issueLegacyVideoMediaUrls(input: {
  video: LegacyVideo;
  purpose: LegacyVideoMediaPurpose;
  /** Authenticated viewer (owner or emergency grantee). */
  viewerUserId: string;
  accessMode: "owner" | "granted_emergency";
}): Promise<LegacyVideoMediaUrls> {
  const { video, purpose, viewerUserId, accessMode } = input;

  if (purpose === "thumbnail") {
    const thumb = await signThumbnail(video);
    if (!thumb) {
      return {
        purpose,
        playbackUrl: null,
        thumbnailUrl: null,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        expiresIn: 60,
        contentType: "image/jpeg",
        title: video.title,
        videoId: video.id,
      };
    }

    const action: SensitiveAccessAction =
      accessMode === "granted_emergency"
        ? "legacy.granted.video.thumbnail_url"
        : "legacy.video.thumbnail_url";

    await logSensitiveAccess({
      userId: viewerUserId,
      action,
      targetType: "legacy_video",
      targetId: video.id,
      metadata: {
        purpose: "thumbnail",
        sectionType: video.sectionType,
        ...(accessMode === "granted_emergency"
          ? { ownerUserId: video.userId }
          : {}),
      },
    });

    return {
      purpose,
      playbackUrl: null,
      thumbnailUrl: thumb.url,
      expiresAt: thumb.expiresAt,
      expiresIn: thumb.expiresIn,
      contentType: "image/jpeg",
      title: video.title,
      videoId: video.id,
    };
  }

  const play = await getLegacyVideoPlaybackUrl({
    userId: video.userId,
    key: video.storageKey,
    videoId: video.id,
    purpose: "playback",
    filename: `${video.title}.mp4`,
    contentType: video.contentType,
  });

  const thumb = await signThumbnail(video);

  const action: SensitiveAccessAction =
    accessMode === "granted_emergency"
      ? "legacy.granted.video.playback_url"
      : "legacy.video.playback_url";

  await logSensitiveAccess({
    userId: viewerUserId,
    action,
    targetType: "legacy_video",
    targetId: video.id,
    metadata: {
      purpose: "playback",
      sectionType: video.sectionType,
      ...(accessMode === "granted_emergency"
        ? { ownerUserId: video.userId }
        : {}),
    },
  });

  return {
    purpose,
    playbackUrl: play.url,
    thumbnailUrl: thumb?.url ?? null,
    expiresAt: play.expiresAt,
    expiresIn: play.expiresIn,
    contentType: video.contentType,
    title: video.title,
    videoId: video.id,
  };
}
