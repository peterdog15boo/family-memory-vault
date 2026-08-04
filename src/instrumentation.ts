/**
 * Next.js instrumentation — runs once when the Node server starts.
 * Validates production env so misconfigured deploys fail fast.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;

  const { assertProductionEnv } = await import("@/lib/env");
  assertProductionEnv();
}
