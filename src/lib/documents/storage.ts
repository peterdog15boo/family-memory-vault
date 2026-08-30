/**
 * Secure R2 storage for Private Documents.
 *
 * Isolation rules:
 * - Keys live only under private-documents/ and private-documents-temp/
 *   (conceptually private-docs/{userId}/… — never gallery prefixes).
 * - Client access is short-lived signed URLs only (no public/unsigned URLs).
 * - Gallery helpers (getDownloadUrl / getUploadUrl / movies) refuse these keys.
 * - Never join private documents into Memories, Movies, or family sharing.
 */

import {
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";
import sharp from "sharp";
import {
  PRIVATE_DOCUMENT_ALLOWED_CONTENT_TYPES,
  PRIVATE_DOCUMENT_MAX_BYTES,
  type PrivateDocumentAllowedContentType,
} from "@/lib/documents/constants";
import { LogEvents } from "@/lib/observability/events";
import { logger } from "@/lib/observability/logger";
import {
  DEFAULT_UPLOAD_EXPIRES_IN_SECONDS,
  MAX_SIGNED_URL_EXPIRES_IN_SECONDS,
  R2_PREFIXES,
  deleteObject,
  getObjectBytes,
  getR2Bucket,
  getR2Client,
  headObjectMeta,
  moveObject,
  putObjectBytes,
  type PresignedUrlResult,
} from "@/lib/r2";

export {
  PRIVATE_DOCUMENT_ALLOWED_CONTENT_TYPES,
  PRIVATE_DOCUMENT_MAX_BYTES,
  type PrivateDocumentAllowedContentType,
} from "@/lib/documents/constants";

/* -------------------------------------------------------------------------- */
/* Limits & allowlist                                                         */
/* -------------------------------------------------------------------------- */

import {
  PRIVATE_DOCUMENT_DOWNLOAD_MAX_TTL_SECONDS,
  PRIVATE_DOCUMENT_DOWNLOAD_TTL_SECONDS,
} from "@/lib/security/sensitive-access";

/** Default / hard caps for signed URLs — keep private docs short-lived. */
export const PRIVATE_DOCUMENT_UPLOAD_EXPIRES_IN_SECONDS =
  DEFAULT_UPLOAD_EXPIRES_IN_SECONDS; // 10 minutes
export const PRIVATE_DOCUMENT_DOWNLOAD_EXPIRES_IN_SECONDS =
  PRIVATE_DOCUMENT_DOWNLOAD_TTL_SECONDS;
export const PRIVATE_DOCUMENT_DOWNLOAD_MAX_EXPIRES_IN_SECONDS =
  PRIVATE_DOCUMENT_DOWNLOAD_MAX_TTL_SECONDS;

const THUMB_MAX_EDGE = 480;
const THUMB_JPEG_QUALITY = 72;

const ALLOWED_SET = new Set<string>(PRIVATE_DOCUMENT_ALLOWED_CONTENT_TYPES);

const EXT_TO_CONTENT_TYPE: Record<string, PrivateDocumentAllowedContentType> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  rtf: "application/rtf",
};

export class PrivateDocumentStorageError extends Error {
  readonly code:
    | "validation"
    | "forbidden"
    | "not_found"
    | "unsupported";

  constructor(
    message: string,
    code: PrivateDocumentStorageError["code"] = "validation",
  ) {
    super(message);
    this.name = "PrivateDocumentStorageError";
    this.code = code;
  }
}

/* -------------------------------------------------------------------------- */
/* Key builders                                                               */
/* -------------------------------------------------------------------------- */

function sanitizeFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop()?.trim() || "document";
  return base.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 180);
}

function extensionFromFilename(filename: string): string {
  const match = filename.toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return match?.[1] ?? "bin";
}

/** Temp upload key before the document row is committed. */
export function buildPrivateDocumentTempKey(input: {
  userId: string;
  filename: string;
  uploadId?: string;
}): string {
  const id = input.uploadId ?? nanoid();
  const ext = extensionFromFilename(input.filename);
  return `${R2_PREFIXES.privateDocumentsTemp}${input.userId}/${id}.${ext}`;
}

/** Permanent object key for a stored private document. */
export function buildPrivateDocumentStorageKey(input: {
  userId: string;
  documentId: string;
  filename: string;
}): string {
  const safe = sanitizeFilename(input.filename);
  return `${R2_PREFIXES.privateDocuments}${input.userId}/${input.documentId}/${safe}`;
}

/** Optional preview thumbnail for images (PDF first-page later). */
export function buildPrivateDocumentThumbnailKey(input: {
  userId: string;
  documentId: string;
}): string {
  return `${R2_PREFIXES.privateDocuments}${input.userId}/${input.documentId}/thumb.jpg`;
}

export function isPrivateDocumentKeyForUser(
  key: string,
  userId: string,
): boolean {
  const permanent = `${R2_PREFIXES.privateDocuments}${userId}/`;
  const temp = `${R2_PREFIXES.privateDocumentsTemp}${userId}/`;
  const trustPermanent = `${R2_PREFIXES.privateLegacyTrusts}${userId}/`;
  const trustTemp = `${R2_PREFIXES.privateLegacyTrustsTemp}${userId}/`;
  return (
    key.startsWith(permanent) ||
    key.startsWith(temp) ||
    key.startsWith(trustPermanent) ||
    key.startsWith(trustTemp)
  );
}

export function isPrivateDocumentTempKey(key: string): boolean {
  return key.startsWith(R2_PREFIXES.privateDocumentsTemp);
}

export function isPrivateDocumentPermanentKey(key: string): boolean {
  return key.startsWith(R2_PREFIXES.privateDocuments);
}

function assertUserId(userId: string): void {
  if (!userId?.trim()) {
    throw new PrivateDocumentStorageError("userId is required.", "validation");
  }
}

export function assertPrivateDocumentKeyForUser(
  key: string,
  userId: string,
): void {
  assertUserId(userId);
  if (!key?.trim()) {
    throw new PrivateDocumentStorageError("storage key is required.", "validation");
  }
  if (!isPrivateDocumentKeyForUser(key, userId)) {
    throw new PrivateDocumentStorageError(
      "Refusing private-document operation outside the owner’s private-documents prefix.",
      "forbidden",
    );
  }
}

function safeKeyPrefix(key: string): string {
  return key.split("/").slice(0, 3).join("/");
}

function clampPrivateDownloadExpires(expiresIn: number): number {
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new PrivateDocumentStorageError(
      "expiresIn must be a positive number of seconds.",
    );
  }
  return Math.min(
    Math.floor(expiresIn),
    PRIVATE_DOCUMENT_DOWNLOAD_MAX_EXPIRES_IN_SECONDS,
    MAX_SIGNED_URL_EXPIRES_IN_SECONDS,
  );
}

function clampPrivateUploadExpires(expiresIn: number): number {
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new PrivateDocumentStorageError(
      "expiresIn must be a positive number of seconds.",
    );
  }
  return Math.min(
    Math.floor(expiresIn),
    PRIVATE_DOCUMENT_UPLOAD_EXPIRES_IN_SECONDS,
    MAX_SIGNED_URL_EXPIRES_IN_SECONDS,
  );
}

/* -------------------------------------------------------------------------- */
/* Content-type validation                                                    */
/* -------------------------------------------------------------------------- */

export function normalizePrivateDocumentContentType(
  contentType: string,
): string {
  return contentType.trim().toLowerCase().split(";")[0]?.trim() ?? "";
}

export function isAllowedPrivateDocumentContentType(
  contentType: string,
): boolean {
  return ALLOWED_SET.has(normalizePrivateDocumentContentType(contentType));
}

export function contentTypeForPrivateDocumentFilename(
  filename: string,
): PrivateDocumentAllowedContentType | null {
  const ext = extensionFromFilename(filename);
  return EXT_TO_CONTENT_TYPE[ext] ?? null;
}

export function assertAllowedPrivateDocumentUpload(input: {
  contentType: string;
  /** When omitted, only content-type / filename rules are checked. */
  sizeBytes?: number;
  filename?: string;
}): PrivateDocumentAllowedContentType {
  const normalized = normalizePrivateDocumentContentType(input.contentType);
  if (!ALLOWED_SET.has(normalized)) {
    throw new PrivateDocumentStorageError(
      `Unsupported content type "${input.contentType}". Allowed: PDF, JPEG, PNG, WebP, and common Office formats.`,
      "unsupported",
    );
  }
  if (input.sizeBytes !== undefined) {
    if (
      !Number.isFinite(input.sizeBytes) ||
      input.sizeBytes <= 0 ||
      input.sizeBytes > PRIVATE_DOCUMENT_MAX_BYTES
    ) {
      throw new PrivateDocumentStorageError(
        `File size must be between 1 byte and ${PRIVATE_DOCUMENT_MAX_BYTES} bytes.`,
        "validation",
      );
    }
  }
  if (input.filename) {
    const fromName = contentTypeForPrivateDocumentFilename(input.filename);
    if (fromName && fromName !== normalized) {
      // Soft mismatch warning path: still allow if MIME is on the allowlist,
      // but reject obvious image↔office mismatches when extension is known.
      const imageish = normalized.startsWith("image/");
      const nameImage = fromName.startsWith("image/");
      const pdfish = normalized === "application/pdf";
      const namePdf = fromName === "application/pdf";
      if ((imageish !== nameImage) || (pdfish !== namePdf)) {
        throw new PrivateDocumentStorageError(
          `Content type "${normalized}" does not match filename extension.`,
          "validation",
        );
      }
    }
  }
  return normalized as PrivateDocumentAllowedContentType;
}

export function canGeneratePrivateDocumentImagePreview(
  contentType: string,
): boolean {
  const t = normalizePrivateDocumentContentType(contentType);
  return t === "image/jpeg" || t === "image/png" || t === "image/webp";
}

/* -------------------------------------------------------------------------- */
/* Signed URLs                                                                */
/* -------------------------------------------------------------------------- */

export type PrivateDocumentUploadUrlResult = PresignedUrlResult & {
  contentType: string;
  maxBytes: number;
};

/**
 * Issue a short-lived PUT URL under private-documents-temp/{userId}/.
 * Never uses the gallery getUploadUrl helper (temp/ only).
 */
export async function createPrivateDocumentUploadUrl(input: {
  userId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadId?: string;
  expiresInSeconds?: number;
}): Promise<PrivateDocumentUploadUrlResult> {
  assertUserId(input.userId);
  const contentType = assertAllowedPrivateDocumentUpload({
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    filename: input.filename,
  });

  const key = buildPrivateDocumentTempKey({
    userId: input.userId,
    filename: input.filename,
    uploadId: input.uploadId,
  });
  assertPrivateDocumentKeyForUser(key, input.userId);

  const expires = clampPrivateUploadExpires(
    input.expiresInSeconds ?? PRIVATE_DOCUMENT_UPLOAD_EXPIRES_IN_SECONDS,
  );

  const command = new PutObjectCommand({
    Bucket: getR2Bucket(),
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(getR2Client(), command, { expiresIn: expires });

  logger.info(LogEvents.privateDocumentUploadUrlIssued, {
    userId: input.userId,
    contentType,
    sizeBytes: input.sizeBytes,
    keyPrefix: safeKeyPrefix(key),
    expiresIn: expires,
  });

  return {
    url,
    key,
    expiresIn: expires,
    expiresAt: new Date(Date.now() + expires * 1000).toISOString(),
    contentType,
    maxBytes: PRIVATE_DOCUMENT_MAX_BYTES,
  };
}

export type PrivateDocumentDownloadUrlResult = PresignedUrlResult & {
  documentId?: string;
};

/**
 * Issue a short-lived GET URL for an owner’s private document (or thumbnail).
 * Logs access carefully — never logs the signed URL itself.
 */
export async function createPrivateDocumentDownloadUrl(input: {
  userId: string;
  key: string;
  documentId?: string;
  /** "document" | "thumbnail" | "temp" — for audit context only. */
  purpose?: "document" | "thumbnail" | "temp";
  filename?: string;
  /** Defaults to attachment when a filename is provided. */
  disposition?: "attachment" | "inline";
  expiresInSeconds?: number;
}): Promise<PrivateDocumentDownloadUrlResult> {
  assertPrivateDocumentKeyForUser(input.key, input.userId);

  const expires = clampPrivateDownloadExpires(
    input.expiresInSeconds ?? PRIVATE_DOCUMENT_DOWNLOAD_EXPIRES_IN_SECONDS,
  );

  const dispositionFilename = input.filename
    ? sanitizeFilename(input.filename)
    : undefined;
  const dispositionMode = input.disposition ?? "attachment";

  const command = new GetObjectCommand({
    Bucket: getR2Bucket(),
    Key: input.key,
    ResponseCacheControl: `private, max-age=${expires}, no-store`,
    ...(dispositionFilename
      ? {
          ResponseContentDisposition: `${dispositionMode}; filename="${dispositionFilename.replace(/"/g, "")}"`,
        }
      : {}),
  });

  const url = await getSignedUrl(getR2Client(), command, { expiresIn: expires });

  logger.info(LogEvents.privateDocumentDownloadUrlIssued, {
    userId: input.userId,
    documentId: input.documentId,
    purpose: input.purpose ?? "document",
    keyPrefix: safeKeyPrefix(input.key),
    expiresIn: expires,
  });

  return {
    url,
    key: input.key,
    expiresIn: expires,
    expiresAt: new Date(Date.now() + expires * 1000).toISOString(),
    documentId: input.documentId,
  };
}

export type PrivateDocumentObjectStream = {
  body: ReadableStream<Uint8Array>;
  contentType?: string;
  contentLength?: number;
};

/**
 * Stream an owner’s private document bytes (same-origin viewers; no CORS).
 */
export async function getPrivateDocumentObjectStream(input: {
  userId: string;
  key: string;
}): Promise<PrivateDocumentObjectStream> {
  assertPrivateDocumentKeyForUser(input.key, input.userId);

  const response = await getR2Client().send(
    new GetObjectCommand({
      Bucket: getR2Bucket(),
      Key: input.key,
    }),
  );

  if (!response.Body) {
    throw new PrivateDocumentStorageError(
      `Private document object is empty: ${safeKeyPrefix(input.key)}`,
      "not_found",
    );
  }

  return {
    body: response.Body.transformToWebStream(),
    contentType: response.ContentType,
    contentLength: response.ContentLength,
  };
}

/* -------------------------------------------------------------------------- */
/* Promote / finalize                                                         */
/* -------------------------------------------------------------------------- */

export type PromotePrivateDocumentResult = {
  fromKey: string;
  toKey: string;
  contentType?: string;
  sizeBytes: number;
};

/**
 * Move a temp upload into private-documents/{userId}/{documentId}/…
 * Verifies the object exists and size is within limits.
 */
export async function promotePrivateDocumentTempToPermanent(input: {
  userId: string;
  documentId: string;
  tempKey: string;
  filename: string;
  expectedContentType?: string;
  expectedSizeBytes?: number;
}): Promise<PromotePrivateDocumentResult> {
  assertPrivateDocumentKeyForUser(input.tempKey, input.userId);
  if (!isPrivateDocumentTempKey(input.tempKey)) {
    throw new PrivateDocumentStorageError(
      "promote requires a private-documents-temp/ source key.",
      "validation",
    );
  }

  const meta = await headObjectMeta(input.tempKey);
  if (!meta) {
    throw new PrivateDocumentStorageError(
      "Uploaded document object was not found in storage.",
      "not_found",
    );
  }
  if (meta.contentLength > PRIVATE_DOCUMENT_MAX_BYTES) {
    throw new PrivateDocumentStorageError(
      "Uploaded document exceeds the maximum allowed size.",
      "validation",
    );
  }
  if (
    input.expectedSizeBytes != null &&
    meta.contentLength !== input.expectedSizeBytes
  ) {
    throw new PrivateDocumentStorageError(
      "Uploaded object size does not match the declared size.",
      "validation",
    );
  }
  if (input.expectedContentType) {
    const expected = normalizePrivateDocumentContentType(
      input.expectedContentType,
    );
    const actual = normalizePrivateDocumentContentType(
      meta.contentType ?? "",
    );
    if (actual && actual !== expected) {
      throw new PrivateDocumentStorageError(
        "Uploaded object content type does not match the declared type.",
        "validation",
      );
    }
  }

  const toKey = buildPrivateDocumentStorageKey({
    userId: input.userId,
    documentId: input.documentId,
    filename: input.filename,
  });
  assertPrivateDocumentKeyForUser(toKey, input.userId);

  await moveObject(input.tempKey, toKey);

  logger.info(LogEvents.privateDocumentPromoted, {
    userId: input.userId,
    documentId: input.documentId,
    keyPrefix: safeKeyPrefix(toKey),
    sizeBytes: meta.contentLength,
    contentType: meta.contentType,
  });

  return {
    fromKey: input.tempKey,
    toKey,
    contentType: meta.contentType,
    sizeBytes: meta.contentLength,
  };
}

/* -------------------------------------------------------------------------- */
/* Preview / thumbnail                                                        */
/* -------------------------------------------------------------------------- */

export type PrivateDocumentThumbnailResult = {
  thumbnailKey: string | null;
  byteSize: number;
  skipped: boolean;
  reason?: string;
};

/**
 * Generate a JPEG preview when possible (raster images).
 * PDF first-page preview is intentionally deferred (skipped with a reason).
 */
export async function generatePrivateDocumentThumbnail(input: {
  userId: string;
  documentId: string;
  storageKey: string;
  contentType: string;
}): Promise<PrivateDocumentThumbnailResult> {
  assertPrivateDocumentKeyForUser(input.storageKey, input.userId);

  const contentType = normalizePrivateDocumentContentType(input.contentType);

  if (contentType === "application/pdf") {
    logger.info(LogEvents.privateDocumentThumbnailSkipped, {
      userId: input.userId,
      documentId: input.documentId,
      reason: "pdf_first_page_preview_pending",
    });
    return {
      thumbnailKey: null,
      byteSize: 0,
      skipped: true,
      reason: "pdf_first_page_preview_pending",
    };
  }

  if (!canGeneratePrivateDocumentImagePreview(contentType)) {
    logger.info(LogEvents.privateDocumentThumbnailSkipped, {
      userId: input.userId,
      documentId: input.documentId,
      reason: "unsupported_content_type",
      contentType,
    });
    return {
      thumbnailKey: null,
      byteSize: 0,
      skipped: true,
      reason: "unsupported_content_type",
    };
  }

  const { body } = await getObjectBytes(input.storageKey);
  const jpeg = await sharp(body)
    .rotate()
    .resize({
      width: THUMB_MAX_EDGE,
      height: THUMB_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: THUMB_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  const thumbnailKey = buildPrivateDocumentThumbnailKey({
    userId: input.userId,
    documentId: input.documentId,
  });
  assertPrivateDocumentKeyForUser(thumbnailKey, input.userId);

  await putObjectBytes(thumbnailKey, jpeg, {
    contentType: "image/jpeg",
    cacheControl: "private, max-age=31536000",
  });

  logger.info(LogEvents.privateDocumentThumbnailGenerated, {
    userId: input.userId,
    documentId: input.documentId,
    keyPrefix: safeKeyPrefix(thumbnailKey),
    byteSize: jpeg.byteLength,
  });

  return {
    thumbnailKey,
    byteSize: jpeg.byteLength,
    skipped: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Delete / replace                                                           */
/* -------------------------------------------------------------------------- */

export type DeletePrivateDocumentObjectsResult = {
  deletedKeys: string[];
};

/** Delete permanent (and optional thumbnail / temp) objects for a document. */
export async function deletePrivateDocumentObjects(input: {
  userId: string;
  storageKey?: string | null;
  thumbnailKey?: string | null;
  tempKey?: string | null;
  documentId?: string;
}): Promise<DeletePrivateDocumentObjectsResult> {
  assertUserId(input.userId);
  const deletedKeys: string[] = [];

  for (const key of [input.storageKey, input.thumbnailKey, input.tempKey]) {
    if (!key?.trim()) continue;
    assertPrivateDocumentKeyForUser(key, input.userId);
    await deleteObject(key);
    deletedKeys.push(key);
  }

  logger.info(LogEvents.privateDocumentObjectsDeleted, {
    userId: input.userId,
    documentId: input.documentId,
    deletedCount: deletedKeys.length,
    keyPrefixes: deletedKeys.map(safeKeyPrefix),
  });

  return { deletedKeys };
}

export type ReplacePrivateDocumentFileResult = {
  storageKey: string;
  thumbnailKey: string | null;
  sizeBytes: number;
  contentType: string;
  previousStorageKey: string;
  previousThumbnailKey: string | null;
};

/**
 * Replace an existing document’s file: promote new temp → permanent, regenerate
 * preview when possible, then delete the previous objects.
 *
 * Caller updates the DB row with the returned keys / metadata.
 */
export async function replacePrivateDocumentFile(input: {
  userId: string;
  documentId: string;
  previousStorageKey: string;
  previousThumbnailKey?: string | null;
  tempKey: string;
  filename: string;
  contentType: string;
  expectedSizeBytes?: number;
}): Promise<ReplacePrivateDocumentFileResult> {
  assertPrivateDocumentKeyForUser(input.previousStorageKey, input.userId);
  if (input.previousThumbnailKey) {
    assertPrivateDocumentKeyForUser(input.previousThumbnailKey, input.userId);
  }

  const contentType = assertAllowedPrivateDocumentUpload({
    contentType: input.contentType,
    sizeBytes: input.expectedSizeBytes,
    filename: input.filename,
  });

  const promoted = await promotePrivateDocumentTempToPermanent({
    userId: input.userId,
    documentId: input.documentId,
    tempKey: input.tempKey,
    filename: input.filename,
    expectedContentType: contentType,
    expectedSizeBytes: input.expectedSizeBytes,
  });

  const thumb = await generatePrivateDocumentThumbnail({
    userId: input.userId,
    documentId: input.documentId,
    storageKey: promoted.toKey,
    contentType,
  });

  // Remove prior objects only after the new file is in place.
  const staleKeys = [input.previousStorageKey, input.previousThumbnailKey]
    .filter((key): key is string => Boolean(key?.trim()))
    .filter(
      (key) => key !== promoted.toKey && key !== thumb.thumbnailKey,
    );

  if (staleKeys.length) {
    await deletePrivateDocumentObjects({
      userId: input.userId,
      documentId: input.documentId,
      storageKey: staleKeys[0],
      thumbnailKey: staleKeys[1] ?? null,
    });
  }

  logger.info(LogEvents.privateDocumentReplaced, {
    userId: input.userId,
    documentId: input.documentId,
    keyPrefix: safeKeyPrefix(promoted.toKey),
    contentType,
    sizeBytes: promoted.sizeBytes,
  });

  return {
    storageKey: promoted.toKey,
    thumbnailKey: thumb.thumbnailKey,
    sizeBytes: promoted.sizeBytes,
    contentType,
    previousStorageKey: input.previousStorageKey,
    previousThumbnailKey: input.previousThumbnailKey ?? null,
  };
}

/** Best-effort cleanup of an abandoned temp upload (e.g. user cancelled). */
export async function discardPrivateDocumentTempUpload(input: {
  userId: string;
  tempKey: string;
}): Promise<void> {
  assertPrivateDocumentKeyForUser(input.tempKey, input.userId);
  if (!isPrivateDocumentTempKey(input.tempKey)) {
    throw new PrivateDocumentStorageError(
      "discard requires a private-documents-temp/ key.",
      "validation",
    );
  }
  await deleteObject(input.tempKey);
  logger.info(LogEvents.privateDocumentTempDiscarded, {
    userId: input.userId,
    keyPrefix: safeKeyPrefix(input.tempKey),
  });
}
