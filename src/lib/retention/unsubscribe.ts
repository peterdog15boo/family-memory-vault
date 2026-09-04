/**
 * Signed unsubscribe tokens for weekly retention email (no login required).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

function secret(): string {
  return (
    process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim() ||
    process.env.WORKER_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    ""
  );
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(value: string): Buffer {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(normalized, "base64");
}

export function createRetentionUnsubscribeToken(
  userId: string,
  now = Date.now(),
): string | null {
  const key = secret();
  if (!key || !userId.trim()) return null;
  const exp = now + TOKEN_TTL_MS;
  const payload = `${userId}.${exp}`;
  const sig = createHmac("sha256", key).update(payload).digest();
  return `${b64url(Buffer.from(payload, "utf8"))}.${b64url(sig)}`;
}

export function verifyRetentionUnsubscribeToken(
  token: string,
): { userId: string } | null {
  const key = secret();
  if (!key || !token?.trim()) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  let payload: string;
  try {
    payload = fromB64url(payloadB64).toString("utf8");
  } catch {
    return null;
  }

  const expected = createHmac("sha256", key).update(payload).digest();
  let actual: Buffer;
  try {
    actual = fromB64url(sigB64);
  } catch {
    return null;
  }
  if (
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual)
  ) {
    return null;
  }

  const [userId, expRaw] = payload.split(".");
  const exp = Number(expRaw);
  if (!userId?.trim() || !Number.isFinite(exp) || Date.now() > exp) {
    return null;
  }
  return { userId };
}
