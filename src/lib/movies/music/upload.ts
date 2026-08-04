/**
 * Movie music upload helpers — private R2 under movies/{userId}/music/.
 * Client uploads land in temp/ first, then promote on complete.
 */

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";
import { z } from "zod";
import {
  DEFAULT_DOWNLOAD_EXPIRES_IN_SECONDS,
  DEFAULT_UPLOAD_EXPIRES_IN_SECONDS,
  MAX_SIGNED_URL_EXPIRES_IN_SECONDS,
  R2_PREFIXES,
  getObjectBytes,
  getR2Bucket,
  getR2Client,
  getUploadUrl,
  headObjectMeta,
  isTempKey,
  moveObject,
  type PresignedUrlResult,
} from "@/lib/r2";
import { MovieError } from "@/lib/movies/errors";

export const MOVIE_MUSIC_ALLOWED_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/aac",
] as const;

export type MovieMusicContentType =
  (typeof MOVIE_MUSIC_ALLOWED_TYPES)[number];

/** 25 MB — enough for several minutes of compressed audio. */
export const MOVIE_MUSIC_MAX_BYTES = 25 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "aac",
};

export const movieMusicUploadRequestSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(3).max(100),
  size: z.number().int().positive().max(MOVIE_MUSIC_MAX_BYTES),
});

export function normalizeMusicContentType(raw: string): MovieMusicContentType {
  const lower = raw.trim().toLowerCase();
  const allowed = MOVIE_MUSIC_ALLOWED_TYPES as readonly string[];
  if (allowed.includes(lower)) return lower as MovieMusicContentType;
  // Browsers sometimes send empty or generic types for .mp3
  if (lower === "audio/mpg" || lower === "audio/x-mpeg") return "audio/mpeg";
  throw new MovieError(
    "Unsupported music format. Use MP3, WAV, or M4A.",
    { retryable: false, code: "validation" },
  );
}

export function extensionForMusicType(contentType: string): string {
  return EXT_BY_TYPE[contentType] ?? "mp3";
}

export function buildMovieMusicTempKey(
  userId: string,
  filename: string,
): string {
  const safe = filename.replace(/[^\w.\-]+/g, "_").slice(0, 80);
  const ext =
    safe.includes(".") && safe.split(".").pop()
      ? safe.split(".").pop()!.toLowerCase().slice(0, 5)
      : "mp3";
  return `${R2_PREFIXES.temp}${userId}/movie-music/${nanoid()}.${ext}`;
}

export function buildMovieMusicKey(userId: string, uploadId?: string): string {
  if (!userId?.trim()) throw new Error("userId required");
  const id = uploadId?.trim() || nanoid();
  return `${R2_PREFIXES.movies}${userId}/music/${id}`;
}

export function isMovieMusicKeyForUser(key: string, userId: string): boolean {
  if (!key || !userId) return false;
  const prefix = `${R2_PREFIXES.movies}${userId}/music/`;
  return key.startsWith(prefix) && !key.includes("..");
}

export function isMovieMusicTempKeyForUser(
  key: string,
  userId: string,
): boolean {
  if (!key || !userId) return false;
  return (
    isTempKey(key) &&
    key.startsWith(`${R2_PREFIXES.temp}${userId}/movie-music/`) &&
    !key.includes("..")
  );
}

export async function createMovieMusicUploadUrl(input: {
  userId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}): Promise<PresignedUrlResult & { contentType: string; maxBytes: number }> {
  const contentType = normalizeMusicContentType(input.contentType);
  if (input.sizeBytes > MOVIE_MUSIC_MAX_BYTES) {
    throw new MovieError(
      `Music file must be under ${Math.round(MOVIE_MUSIC_MAX_BYTES / (1024 * 1024))} MB.`,
      { retryable: false, code: "validation" },
    );
  }

  const key = buildMovieMusicTempKey(input.userId, input.filename);
  const signed = await getUploadUrl(
    key,
    contentType,
    DEFAULT_UPLOAD_EXPIRES_IN_SECONDS,
  );

  return {
    ...signed,
    contentType,
    maxBytes: MOVIE_MUSIC_MAX_BYTES,
  };
}

export async function completeMovieMusicUpload(input: {
  userId: string;
  tempKey: string;
  filename: string;
  contentType: string;
}): Promise<{ key: string; contentType: string; sizeBytes: number; label: string }> {
  if (!isMovieMusicTempKeyForUser(input.tempKey, input.userId)) {
    throw new MovieError("Invalid music upload key.", {
      retryable: false,
      code: "validation",
    });
  }

  const contentType = normalizeMusicContentType(input.contentType);
  const meta = await headObjectMeta(input.tempKey);
  if (!meta) {
    throw new MovieError("Upload not found. Try uploading again.", {
      retryable: false,
      code: "not_found",
    });
  }
  if ((meta.contentLength ?? 0) < 32) {
    throw new MovieError("Music file is empty.", {
      retryable: false,
      code: "validation",
    });
  }
  if ((meta.contentLength ?? 0) > MOVIE_MUSIC_MAX_BYTES) {
    throw new MovieError("Music file is too large.", {
      retryable: false,
      code: "validation",
    });
  }

  const ext = extensionForMusicType(contentType);
  const dest = `${buildMovieMusicKey(input.userId)}.${ext}`;
  await moveObject(input.tempKey, dest);

  const label =
    input.filename.replace(/\.[^.]+$/, "").trim().slice(0, 80) || "Uploaded track";

  return {
    key: dest,
    contentType,
    sizeBytes: meta.contentLength ?? 0,
    label,
  };
}

export async function createMovieMusicPreviewUrl(input: {
  userId: string;
  key: string;
  expiresInSeconds?: number;
}): Promise<PresignedUrlResult> {
  if (!isMovieMusicKeyForUser(input.key, input.userId)) {
    throw new MovieError("Music track not found.", {
      retryable: false,
      code: "not_found",
    });
  }

  const expires = Math.min(
    input.expiresInSeconds ?? DEFAULT_DOWNLOAD_EXPIRES_IN_SECONDS,
    MAX_SIGNED_URL_EXPIRES_IN_SECONDS,
  );

  const command = new GetObjectCommand({
    Bucket: getR2Bucket(),
    Key: input.key,
    ResponseCacheControl: `private, max-age=${expires}`,
  });

  const url = await getSignedUrl(getR2Client(), command, { expiresIn: expires });

  return {
    url,
    key: input.key,
    expiresIn: expires,
    expiresAt: new Date(Date.now() + expires * 1000).toISOString(),
  };
}

/** Worker helper — fetch uploaded music bytes for the owning user. */
export async function fetchMovieMusicBytes(
  userId: string,
  key: string,
): Promise<Buffer> {
  if (!isMovieMusicKeyForUser(key, userId)) {
    throw new MovieError("Invalid music object key.", {
      retryable: false,
      code: "validation",
    });
  }
  const { body } = await getObjectBytes(key);
  if (!body?.byteLength) {
    throw new MovieError(
      "Uploaded music object is empty or could not be downloaded from storage.",
      { retryable: true },
    );
  }
  return body;
}
