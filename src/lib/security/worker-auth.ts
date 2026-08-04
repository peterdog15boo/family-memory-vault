/**
 * Shared authorization for /api/jobs/* and /api/dev/* worker endpoints.
 * Timing-safe secret compare; fail closed outside local development.
 */

import { timingSafeEqual } from "node:crypto";

function secretsEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function extractPresentedSecret(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim();
  }
  const cronHeader = request.headers.get("x-worker-secret");
  return cronHeader?.trim() || null;
}

/**
 * Authorize a worker/cron request.
 * - Requires WORKER_SECRET or CRON_SECRET in production / non-development.
 * - In development only, allows missing secret with a warning (local DX).
 */
export function authorizeWorkerRequest(request: Request): boolean {
  const secret =
    process.env.WORKER_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  const presented = extractPresentedSecret(request);
  const isDev = process.env.NODE_ENV === "development";

  if (!secret) {
    if (isDev) {
      console.warn(
        "[worker-auth] No WORKER_SECRET/CRON_SECRET — allowing in development only.",
      );
      return true;
    }
    console.error(
      "[worker-auth] Refusing request: WORKER_SECRET/CRON_SECRET is not configured.",
    );
    return false;
  }

  if (!presented) return false;
  return secretsEqual(presented, secret);
}

/**
 * Whether /api/dev/* tooling is enabled.
 * Never enable ALLOW_DEV_* in production.
 */
export function isDevToolingEnabled(flagEnvName: string): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return (
    process.env.NODE_ENV === "development" ||
    process.env[flagEnvName] === "true"
  );
}
