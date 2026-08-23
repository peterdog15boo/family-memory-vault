import { z } from "zod";

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export const ALLOWED_UPLOAD_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_VIDEO_TYPES,
] as const;

export type AllowedUploadType = (typeof ALLOWED_UPLOAD_TYPES)[number];

/** Per-file gallery limits (plan storage still caps total vault capacity). */
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

/**
 * Same-origin `/api/upload/put` proxy buffers the body in memory and is capped
 * by Next middleware (~512 MB). Large home movies must use direct R2 PUT.
 */
export const MAX_PROXY_UPLOAD_BYTES = 512 * 1024 * 1024;

const ALLOWED_SET = new Set<string>(ALLOWED_UPLOAD_TYPES);

/** Extension → canonical MIME (iPhone Camera Roll often omits file.type). */
const EXT_TO_CONTENT_TYPE: Record<string, AllowedUploadType> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  qt: "video/quicktime",
  webm: "video/webm",
};

/** iOS / browser MIME quirks → canonical allowed type. */
const CONTENT_TYPE_ALIASES: Record<string, AllowedUploadType> = {
  "image/jpg": "image/jpeg",
  "image/pjpeg": "image/jpeg",
  "image/x-png": "image/png",
  "image/heic-sequence": "image/heic",
  "image/heif-sequence": "image/heif",
  "video/x-m4v": "video/mp4",
  "video/x-quicktime": "video/quicktime",
};

function extensionFromFilename(filename: string): string | null {
  const base = filename.split(/[/\\]/).pop()?.trim() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot < 0 || dot === base.length - 1) return null;
  return base
    .slice(dot + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Normalize a raw Content-Type / File.type to a canonical allowed upload MIME.
 * Returns null when the value is empty or unknown (caller may fall back to extension).
 */
export function normalizeUploadContentType(
  contentType: string | null | undefined,
): AllowedUploadType | null {
  const raw = (contentType ?? "").trim().toLowerCase();
  if (!raw || raw === "application/octet-stream") return null;

  const withoutParams = raw.split(";")[0]?.trim() ?? raw;
  const aliased = CONTENT_TYPE_ALIASES[withoutParams];
  if (aliased) return aliased;
  if (ALLOWED_SET.has(withoutParams)) {
    return withoutParams as AllowedUploadType;
  }
  return null;
}

/**
 * Resolve upload MIME for API + client validation.
 * Prefers declared type (after alias normalize), then filename extension.
 * Critical for iPhone uploads where `File.type` is often "".
 */
export function resolveUploadContentType(input: {
  filename: string;
  contentType?: string | null;
}): AllowedUploadType | null {
  const fromHeader = normalizeUploadContentType(input.contentType);
  if (fromHeader) return fromHeader;

  const ext = extensionFromFilename(input.filename);
  if (ext && EXT_TO_CONTENT_TYPE[ext]) {
    return EXT_TO_CONTENT_TYPE[ext]!;
  }
  return null;
}

export function isHeicUploadType(contentType: string | null | undefined): boolean {
  const normalized = normalizeUploadContentType(contentType);
  return normalized === "image/heic" || normalized === "image/heif";
}

export function mediaTypeFromContentType(
  contentType: string,
): "photo" | "video" {
  if (
    ALLOWED_VIDEO_TYPES.includes(
      contentType as (typeof ALLOWED_VIDEO_TYPES)[number],
    )
  ) {
    return "video";
  }
  return "photo";
}

export function maxBytesForContentType(contentType: string): number {
  return mediaTypeFromContentType(contentType) === "video"
    ? MAX_VIDEO_BYTES
    : MAX_IMAGE_BYTES;
}

/** Human label for limits (e.g. "50 MB", "2 GB"). */
export function formatUploadLimit(bytes: number): string {
  const gb = 1024 ** 3;
  const mb = 1024 ** 2;
  if (bytes >= gb) {
    const n = bytes / gb;
    return Number.isInteger(n) ? `${n} GB` : `${n.toFixed(1)} GB`;
  }
  const n = bytes / mb;
  return Number.isInteger(n) ? `${n} MB` : `${Math.round(n)} MB`;
}

/** Friendly client/API message when a file exceeds the per-type max. */
export function fileTooLargeMessage(contentType: string, maxBytes?: number): string {
  const kind = mediaTypeFromContentType(contentType);
  const max = maxBytes ?? maxBytesForContentType(contentType);
  const label = formatUploadLimit(max);
  if (kind === "video") {
    return `This video is too large. Videos can be up to ${label}.`;
  }
  return `This photo is too large. Photos can be up to ${label}.`;
}

/**
 * Longer presigned PUT TTL for large home movies on slow links.
 * Capped by R2 `MAX_SIGNED_URL_EXPIRES_IN_SECONDS` (1 hour).
 */
export function uploadExpiresInForBytes(size: number): number {
  if (size >= 512 * 1024 * 1024) return 60 * 60; // 1 hour
  if (size >= 100 * 1024 * 1024) return 60 * 30; // 30 minutes
  return 60 * 10; // 10 minutes
}

/** Whether the same-origin proxy can safely carry this upload. */
export function canProxyUploadBytes(size: number): boolean {
  return Number.isFinite(size) && size > 0 && size <= MAX_PROXY_UPLOAD_BYTES;
}

export const presignRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_UPLOAD_TYPES),
  size: z.number().int().positive(),
});

export const completeMediaSchema = z.object({
  key: z.string().min(1),
  filename: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_UPLOAD_TYPES),
  size: z.number().int().positive(),
});

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME &&
      (process.env.R2_ENDPOINT || process.env.R2_ACCOUNT_ID),
  );
}
