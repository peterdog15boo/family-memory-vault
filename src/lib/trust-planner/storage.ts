/**
 * R2 key helpers for private Trust Planner exports and signed scans (owner-only).
 * Prefix must stay out of gallery download helpers.
 */

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";
import { PRIVATE_DOCUMENT_MAX_BYTES } from "@/lib/documents/constants";
import {
  R2_PREFIXES,
  getR2Bucket,
  getR2Client,
  headObjectMeta,
  isTrustDraftStorageKey,
  moveObject,
  type PresignedUrlResult,
} from "@/lib/r2";
import {
  isTrustSignedScanContentType,
  TRUST_SIGNED_SCAN_CONTENT_TYPES,
} from "@/lib/trust-planner/funding-checklist";

export { isTrustDraftStorageKey };

const TRUST_SIGNED_SCAN_UPLOAD_EXPIRES_IN_SECONDS = 900;

export class TrustStorageError extends Error {
  constructor(
    message: string,
    readonly code: "validation" | "not_found" | "forbidden" = "validation",
  ) {
    super(message);
    this.name = "TrustStorageError";
  }
}

function sanitizeFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop()?.trim() || "upload";
  return base.replace(/[^\w.\-]+/g, "_").slice(0, 180) || "upload";
}

export function buildTrustDraftStorageKey(input: {
  userId: string;
  draftId: string;
  filename: string;
}): string {
  const safe = sanitizeFilename(input.filename);
  return `${R2_PREFIXES.privateLegacyTrusts}${input.userId}/${input.draftId}/${safe}`;
}

export function buildTrustSignedScanTempKey(input: {
  userId: string;
  filename: string;
  uploadId?: string;
}): string {
  const safe = sanitizeFilename(input.filename);
  const id = input.uploadId?.trim() || nanoid();
  return `${R2_PREFIXES.privateLegacyTrustsTemp}${input.userId}/${id}/${safe}`;
}

export function isTrustSignedScanTempKey(key: string): boolean {
  return key.startsWith(R2_PREFIXES.privateLegacyTrustsTemp);
}

export function isTrustDraftKeyForUser(key: string, userId: string): boolean {
  if (!userId?.trim() || !key?.trim()) return false;
  const permanent = `${R2_PREFIXES.privateLegacyTrusts}${userId}/`;
  const temp = `${R2_PREFIXES.privateLegacyTrustsTemp}${userId}/`;
  return key.startsWith(permanent) || key.startsWith(temp);
}

export function assertTrustDraftKeyForUser(key: string, userId: string): void {
  if (!userId?.trim()) {
    throw new TrustStorageError("userId is required.", "validation");
  }
  if (!key?.trim()) {
    throw new TrustStorageError("storage key is required.", "validation");
  }
  if (!isTrustDraftKeyForUser(key, userId)) {
    throw new TrustStorageError(
      "Refusing trust storage operation outside the owner’s private-legacy-trusts prefix.",
      "forbidden",
    );
  }
}

export type TrustSignedScanUploadUrlResult = PresignedUrlResult & {
  contentType: string;
  maxBytes: number;
};

/**
 * Issue a short-lived PUT URL under private-legacy-trusts-temp/{userId}/.
 */
export async function createTrustSignedScanUploadUrl(input: {
  userId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadId?: string;
}): Promise<TrustSignedScanUploadUrlResult> {
  assertTrustDraftKeyForUser(
    `${R2_PREFIXES.privateLegacyTrustsTemp}${input.userId}/`,
    input.userId,
  );

  if (!isTrustSignedScanContentType(input.contentType)) {
    throw new TrustStorageError(
      "Signed trust scans must be PDF, JPEG, or PNG.",
      "validation",
    );
  }
  if (
    !Number.isFinite(input.sizeBytes) ||
    input.sizeBytes <= 0 ||
    input.sizeBytes > PRIVATE_DOCUMENT_MAX_BYTES
  ) {
    throw new TrustStorageError(
      "Upload size must be within the private document limit.",
      "validation",
    );
  }

  const key = buildTrustSignedScanTempKey({
    userId: input.userId,
    filename: input.filename,
    uploadId: input.uploadId,
  });
  assertTrustDraftKeyForUser(key, input.userId);

  const expires = TRUST_SIGNED_SCAN_UPLOAD_EXPIRES_IN_SECONDS;
  const command = new PutObjectCommand({
    Bucket: getR2Bucket(),
    Key: key,
    ContentType: input.contentType,
  });
  const url = await getSignedUrl(getR2Client(), command, { expiresIn: expires });

  return {
    url,
    key,
    expiresIn: expires,
    expiresAt: new Date(Date.now() + expires * 1000).toISOString(),
    contentType: input.contentType,
    maxBytes: PRIVATE_DOCUMENT_MAX_BYTES,
  };
}

export type PromoteTrustSignedScanResult = {
  fromKey: string;
  toKey: string;
  contentType?: string;
  sizeBytes: number;
};

/**
 * Move a temp upload into private-legacy-trusts/{userId}/{draftId}/…
 */
export async function promoteTrustSignedScanTempToPermanent(input: {
  userId: string;
  draftId: string;
  tempKey: string;
  filename: string;
  expectedContentType?: string;
  expectedSizeBytes?: number;
}): Promise<PromoteTrustSignedScanResult> {
  assertTrustDraftKeyForUser(input.tempKey, input.userId);
  if (!isTrustSignedScanTempKey(input.tempKey)) {
    throw new TrustStorageError(
      "promote requires a private-legacy-trusts-temp/ source key.",
      "validation",
    );
  }

  const meta = await headObjectMeta(input.tempKey);
  if (!meta) {
    throw new TrustStorageError(
      "Uploaded trust scan object was not found in storage.",
      "not_found",
    );
  }
  if (meta.contentLength > PRIVATE_DOCUMENT_MAX_BYTES) {
    throw new TrustStorageError(
      "Uploaded trust scan exceeds the maximum allowed size.",
      "validation",
    );
  }
  if (
    input.expectedSizeBytes != null &&
    meta.contentLength !== input.expectedSizeBytes
  ) {
    throw new TrustStorageError(
      "Uploaded object size does not match the declared size.",
      "validation",
    );
  }
  if (input.expectedContentType) {
    const expected = input.expectedContentType.trim().toLowerCase();
    const actual = (meta.contentType ?? "").trim().toLowerCase().split(";")[0];
    if (
      actual &&
      !(TRUST_SIGNED_SCAN_CONTENT_TYPES as readonly string[]).includes(actual)
    ) {
      throw new TrustStorageError(
        "Uploaded object content type is not allowed for trust scans.",
        "validation",
      );
    }
    if (actual && actual !== expected) {
      throw new TrustStorageError(
        "Uploaded object content type does not match the declared type.",
        "validation",
      );
    }
  }

  const toKey = buildTrustDraftStorageKey({
    userId: input.userId,
    draftId: input.draftId,
    filename: input.filename,
  });
  assertTrustDraftKeyForUser(toKey, input.userId);

  await moveObject(input.tempKey, toKey);

  return {
    fromKey: input.tempKey,
    toKey,
    contentType: meta.contentType,
    sizeBytes: meta.contentLength,
  };
}

export async function discardTrustSignedScanTempUpload(input: {
  userId: string;
  tempKey: string;
}): Promise<void> {
  assertTrustDraftKeyForUser(input.tempKey, input.userId);
  if (!isTrustSignedScanTempKey(input.tempKey)) return;
  const { deleteObject } = await import("@/lib/r2");
  await deleteObject(input.tempKey);
}
