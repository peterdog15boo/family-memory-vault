/**
 * Browser-safe Digital Legacy video constants (no R2 / ffmpeg / sharp).
 */

import { MAX_VIDEO_BYTES } from "@/lib/upload/constants";

export const LEGACY_VIDEO_ALLOWED_CONTENT_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
] as const;

export type LegacyVideoAllowedContentType =
  (typeof LEGACY_VIDEO_ALLOWED_CONTENT_TYPES)[number];

export const LEGACY_VIDEO_MAX_BYTES = MAX_VIDEO_BYTES;

const ALLOWED_SET = new Set<string>(LEGACY_VIDEO_ALLOWED_CONTENT_TYPES);

const EXT_TO_CONTENT_TYPE: Record<string, LegacyVideoAllowedContentType> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  qt: "video/quicktime",
  mkv: "video/x-matroska",
};

/** Strip parameters (e.g. codecs=…) so MediaRecorder types match the allowlist. */
export function normalizeLegacyVideoContentType(contentType: string): string {
  return contentType.trim().toLowerCase().split(";")[0]?.trim() ?? "";
}

export function extensionFromLegacyVideoFilename(
  filename: string,
): string | null {
  const match = filename.toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return match?.[1] ?? null;
}

export function contentTypeForLegacyVideoFilename(
  filename: string,
): LegacyVideoAllowedContentType | null {
  const ext = extensionFromLegacyVideoFilename(filename);
  if (!ext) return null;
  return EXT_TO_CONTENT_TYPE[ext] ?? null;
}

export function isAllowedLegacyVideoContentType(contentType: string): boolean {
  return ALLOWED_SET.has(normalizeLegacyVideoContentType(contentType));
}
