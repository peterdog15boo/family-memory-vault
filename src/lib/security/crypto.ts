/**
 * Field-level encryption for secrets at rest (e.g. Plaid access tokens).
 * AES-256-GCM — never log plaintext or ciphertext blobs.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class EncryptionKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncryptionKeyError";
  }
}

function resolveKeyBytes(raw: string | undefined, envName: string): Buffer {
  const value = raw?.trim();
  if (!value) {
    throw new EncryptionKeyError(
      `${envName} is required to encrypt/decrypt secrets at rest.`,
    );
  }

  // Prefer 64-char hex (32 bytes). Also accept standard base64 of 32 bytes.
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, "hex");
  }

  try {
    const buf = Buffer.from(value, "base64");
    if (buf.length === KEY_BYTES) return buf;
  } catch {
    // fall through
  }

  throw new EncryptionKeyError(
    `${envName} must be a 64-character hex string or base64-encoded 32-byte key.`,
  );
}

export function getPlaidTokenEncryptionKey(): Buffer {
  return resolveKeyBytes(
    process.env.PLAID_TOKEN_ENCRYPTION_KEY,
    "PLAID_TOKEN_ENCRYPTION_KEY",
  );
}

/**
 * Encrypt UTF-8 plaintext. Output format: `v1:<base64(iv|tag|ciphertext)>`.
 */
export function encryptSecret(
  plaintext: string,
  key: Buffer = getPlaidTokenEncryptionKey(),
): string {
  if (key.length !== KEY_BYTES) {
    throw new EncryptionKeyError("Encryption key must be 32 bytes.");
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, ciphertext]);
  return `${VERSION}:${packed.toString("base64")}`;
}

/**
 * Decrypt a value produced by {@link encryptSecret}.
 */
export function decryptSecret(
  payload: string,
  key: Buffer = getPlaidTokenEncryptionKey(),
): string {
  if (key.length !== KEY_BYTES) {
    throw new EncryptionKeyError("Encryption key must be 32 bytes.");
  }
  const [version, body] = payload.split(":", 2);
  if (version !== VERSION || !body) {
    throw new EncryptionKeyError("Unrecognized ciphertext format.");
  }
  const packed = Buffer.from(body, "base64");
  if (packed.length < IV_BYTES + 16 + 1) {
    throw new EncryptionKeyError("Ciphertext is truncated.");
  }
  const iv = packed.subarray(0, IV_BYTES);
  const tag = packed.subarray(IV_BYTES, IV_BYTES + 16);
  const ciphertext = packed.subarray(IV_BYTES + 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
