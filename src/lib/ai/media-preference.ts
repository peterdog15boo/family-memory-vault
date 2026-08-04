/**
 * Ask AI media type preference (photos vs videos vs both).
 */

export const MEDIA_PREFERENCES = ["photos", "videos", "both"] as const;
export type MediaPreference = (typeof MEDIA_PREFERENCES)[number];

/**
 * Infer whether the user asked for photos, videos, or both.
 *
 * - "photos" / "pictures" / "images" only → photos
 * - "videos" / "clips" / "footage" only → videos
 * - "photos and videos" or no type word → both
 */
export function detectMediaPreference(raw: string): MediaPreference {
  const lower = raw.toLowerCase();

  if (
    /\b(photos?|pictures?|images?|pics?)\s+and\s+(videos?|clips?|footage)\b/.test(
      lower,
    ) ||
    /\b(videos?|clips?|footage)\s+and\s+(photos?|pictures?|images?|pics?)\b/.test(
      lower,
    ) ||
    /\b(photos?|pictures?|images?)\s*[\/&+]\s*(videos?|clips?)\b/.test(lower) ||
    /\b(videos?|clips?)\s*[\/&+]\s*(photos?|pictures?|images?)\b/.test(lower)
  ) {
    return "both";
  }

  const mentionsPhoto = /\b(photos?|pictures?|images?|pics?)\b/.test(lower);
  // Avoid treating "create a movie" as a video-library search preference.
  const mentionsVideo = /\b(videos?|clips?|footage)\b/.test(lower);

  if (mentionsVideo && !mentionsPhoto) return "videos";
  if (mentionsPhoto && !mentionsVideo) return "photos";
  return "both";
}

export function mediaPreferenceLabel(pref: MediaPreference): string {
  switch (pref) {
    case "photos":
      return "photos";
    case "videos":
      return "videos";
    default:
      return "photos and videos";
  }
}

/** Human count line for mixed photo/video result sets. */
export function formatMediaTypeCounts(
  items: Array<{ type?: string | null }>,
): string {
  let photos = 0;
  let videos = 0;
  let other = 0;
  for (const item of items) {
    if (item.type === "photo") photos += 1;
    else if (item.type === "video") videos += 1;
    else other += 1;
  }
  const total = photos + videos + other;
  if (total === 0) return "0 items";
  if (photos > 0 && videos === 0 && other === 0) {
    return `${photos} photo${photos === 1 ? "" : "s"}`;
  }
  if (videos > 0 && photos === 0 && other === 0) {
    return `${videos} video${videos === 1 ? "" : "s"}`;
  }
  const parts: string[] = [];
  if (photos > 0) parts.push(`${photos} photo${photos === 1 ? "" : "s"}`);
  if (videos > 0) parts.push(`${videos} video${videos === 1 ? "" : "s"}`);
  if (other > 0) parts.push(`${other} item${other === 1 ? "" : "s"}`);
  return parts.join(" · ");
}
