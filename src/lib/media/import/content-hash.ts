/**
 * Practical content fingerprints for import/upload dedupe.
 */

import { createHash } from "crypto";

const SHA256_HEX = /^[a-f0-9]{64}$/;

/** Normalize a client/server SHA-256 hex digest (lowercase). */
export function normalizeContentHash(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!SHA256_HEX.test(trimmed)) return null;
  return trimmed;
}

/** Hash file bytes (Node) — used by cloud import after download. */
export function sha256HexFromBytes(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Skip client hashing for very large files (still get provider+externalId dedupe). */
export const CONTENT_HASH_CLIENT_MAX_BYTES = 80 * 1024 * 1024;
