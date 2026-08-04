/**
 * Resolve MediaSection cinematic props from the clean API and/or a treatment preset.
 */

import {
  getMediaSectionTreatment,
  type MediaSectionAtmosphere,
  type MediaSectionMediaFilter,
  type MediaSectionTreatmentId,
} from "@/lib/media-section/treatments";
import {
  isMediaOverlayId,
  type MediaLayoutId,
  type MediaOverlayId,
  type MediaType,
} from "@/lib/media-section/overlays";

export type ResolveMediaSectionInput = {
  mediaType?: MediaType;
  src?: string | null;
  poster?: string | null;
  overlay?: MediaOverlayId;
  layout?: MediaLayoutId;
  atmosphere?: MediaSectionAtmosphere;
  mediaFilter?: MediaSectionMediaFilter;
  sheen?: boolean;
  treatment?: MediaSectionTreatmentId;
  /** @deprecated Prefer `src` + mediaType="image" */
  imageSrc?: string | null;
  /** @deprecated Prefer `src` + mediaType="video" */
  videoSrc?: string | null;
  /** @deprecated Prefer `poster` */
  posterSrc?: string | null;
};

export type ResolvedMediaSection = {
  mediaType: MediaType;
  src: string | null;
  poster: string | null;
  overlay: MediaOverlayId;
  layout: MediaLayoutId;
  atmosphere: MediaSectionAtmosphere;
  mediaFilter: MediaSectionMediaFilter;
  sheen: boolean;
};

function treatmentOverlayToId(overlay: string): MediaOverlayId {
  if (isMediaOverlayId(overlay)) return overlay;
  return "light-soft";
}

/**
 * Merge treatment defaults with explicit cinematic props.
 * Explicit props always win.
 */
export function resolveMediaSection(
  input: ResolveMediaSectionInput,
): ResolvedMediaSection {
  const preset = input.treatment
    ? getMediaSectionTreatment(input.treatment)
    : null;

  const srcProp = input.src ?? null;
  const legacyImage = input.imageSrc ?? null;
  const legacyVideo = input.videoSrc ?? null;
  const posterProp = input.poster ?? input.posterSrc ?? null;

  let mediaType: MediaType;
  let src: string | null;
  let poster: string | null = posterProp;

  if (input.mediaType === "video") {
    mediaType = "video";
    src = srcProp ?? legacyVideo;
    poster = posterProp ?? legacyImage;
  } else if (input.mediaType === "image") {
    mediaType = "image";
    src = srcProp ?? legacyImage;
  } else if (input.mediaType === "none") {
    mediaType = "none";
    src = null;
  } else if (legacyVideo || (srcProp && looksLikeVideo(srcProp))) {
    mediaType = "video";
    src = legacyVideo ?? srcProp;
    poster = posterProp ?? legacyImage;
  } else if (srcProp || legacyImage) {
    mediaType = "image";
    src = srcProp ?? legacyImage;
  } else {
    mediaType = "none";
    src = null;
  }

  if (mediaType === "video" && !src) {
    if (legacyImage || posterProp) {
      mediaType = "image";
      src = legacyImage ?? posterProp;
    } else {
      mediaType = "none";
    }
  }

  return {
    mediaType,
    src,
    poster: poster ?? null,
    overlay:
      input.overlay ??
      (preset ? treatmentOverlayToId(preset.overlay) : "light-soft"),
    layout: input.layout ?? "split-start",
    atmosphere: input.atmosphere ?? preset?.atmosphere ?? "warm",
    mediaFilter: input.mediaFilter ?? preset?.mediaFilter ?? "soft",
    sheen: input.sheen ?? preset?.sheen ?? false,
  };
}

function looksLikeVideo(url: string): boolean {
  return /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);
}
