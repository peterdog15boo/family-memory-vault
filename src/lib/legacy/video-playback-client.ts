/**
 * Client helpers for Digital Legacy video media URLs.
 * Lists should prefer purpose "thumbnail"; never batch-sign full playback.
 */

export type LegacyVideoMediaResponse = {
  purpose: "playback" | "thumbnail";
  playbackUrl: string | null;
  thumbnailUrl: string | null;
  expiresAt: string;
  expiresIn: number;
  contentType: string;
  title: string;
  videoId: string;
};

export type LegacyVideoPlaybackSource =
  | { mode: "owner"; videoId: string }
  | { mode: "granted_emergency"; ownerUserId: string; videoId: string };

function playbackEndpoint(source: LegacyVideoPlaybackSource): string {
  if (source.mode === "owner") {
    return `/api/legacy/videos/${source.videoId}/playback`;
  }
  return `/api/legacy/granted/${source.ownerUserId}/videos/${source.videoId}/playback`;
}

async function requestMedia(
  source: LegacyVideoPlaybackSource,
  purpose: "playback" | "thumbnail",
): Promise<LegacyVideoMediaResponse> {
  const res = await fetch(playbackEndpoint(source), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose }),
  });
  const data = (await res.json().catch(() => ({}))) as LegacyVideoMediaResponse & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || "Could not open this video securely.");
  }
  return data;
}

/** Poster-only signed URL — safe for list tiles (no video object signed). */
export async function fetchLegacyVideoThumbnail(
  source: LegacyVideoPlaybackSource,
): Promise<string | null> {
  try {
    const media = await requestMedia(source, "thumbnail");
    return media.thumbnailUrl;
  } catch {
    return null;
  }
}

/** Full playback (+ optional poster) for the secure player modal. */
export async function fetchLegacyVideoPlayback(
  source: LegacyVideoPlaybackSource,
): Promise<LegacyVideoMediaResponse> {
  return requestMedia(source, "playback");
}
