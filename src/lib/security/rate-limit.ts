/**
 * In-memory sliding-window rate limiter for sensitive API routes.
 *
 * Suitable for single-node / serverless warm instances. For multi-region
 * production, replace the store with Redis / Upstash (same interface).
 */

import { NextResponse } from "next/server";

type Bucket = {
  timestamps: number[];
};

const store = new Map<string, Bucket>();

const MAX_KEYS = 20_000;

function pruneIfNeeded() {
  if (store.size <= MAX_KEYS) return;
  const keys = store.keys();
  for (let i = 0; i < 1000; i++) {
    const next = keys.next();
    if (next.done) break;
    store.delete(next.value);
  }
}

export type RateLimitResult =
  | { ok: true; remaining: number; resetMs: number }
  | { ok: false; remaining: 0; resetMs: number; retryAfterSec: number };

/**
 * @param key Unique bucket key (e.g. `upload-url:user_abc`)
 * @param limit Max requests in the window
 * @param windowMs Window length in milliseconds
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  let bucket = store.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    store.set(key, bucket);
    pruneIfNeeded();
  }

  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0] ?? now;
    const resetMs = oldest + windowMs;
    return {
      ok: false,
      remaining: 0,
      resetMs,
      retryAfterSec: Math.max(1, Math.ceil((resetMs - now) / 1000)),
    };
  }

  bucket.timestamps.push(now);
  return {
    ok: true,
    remaining: Math.max(0, limit - bucket.timestamps.length),
    resetMs: now + windowMs,
  };
}

/** JSON 429 response with Retry-After. */
export function rateLimitResponse(result: Extract<RateLimitResult, { ok: false }>) {
  return NextResponse.json(
    {
      error: "Too many requests. Please try again shortly.",
      code: "rate_limited",
      retryAfterSec: result.retryAfterSec,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSec),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

/** Convenience: check and return a 429 response if over limit, else null. */
export function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): NextResponse | null {
  const result = checkRateLimit(key, limit, windowMs);
  if (!result.ok) return rateLimitResponse(result);
  return null;
}

/** Common windows */
export const RATE_LIMITS = {
  uploadUrl: { limit: 30, windowMs: 60_000 },
  uploadPut: { limit: 40, windowMs: 60_000 },
  mediaComplete: { limit: 40, windowMs: 60_000 },
  mediaMutate: { limit: 40, windowMs: 60_000 },
  familyInvite: { limit: 10, windowMs: 60_000 },
  familyAccept: { limit: 20, windowMs: 60_000 },
  movieCreate: { limit: 8, windowMs: 60_000 },
  aiSoundtrack: { limit: 4, windowMs: 60_000 },
  billing: { limit: 10, windowMs: 60_000 },
  workerDrain: { limit: 30, windowMs: 60_000 },
  documentsUploadUrl: { limit: 30, windowMs: 60_000 },
  documentsComplete: { limit: 40, windowMs: 60_000 },
  documentsMutate: { limit: 40, windowMs: 60_000 },
  documentsDownload: { limit: 60, windowMs: 60_000 },
  mediaDownload: { limit: 90, windowMs: 60_000 },
  legacyVideosUploadUrl: { limit: 20, windowMs: 60_000 },
  legacyVideosComplete: { limit: 20, windowMs: 60_000 },
  legacyVideosMutate: { limit: 40, windowMs: 60_000 },
  memoryBoxOrder: { limit: 8, windowMs: 60_000 },
  betaNdaAccept: { limit: 10, windowMs: 60_000 },
} as const;
