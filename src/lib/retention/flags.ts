/**
 * Soft retention campaign flags.
 * Ava tips and weekly email are independent; both default on when configured.
 */

function truthy(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  if (!v) return false;
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function falsy(raw: string | undefined): boolean {
  const v = raw?.trim().toLowerCase();
  if (!v) return false;
  return v === "0" || v === "false" || v === "no" || v === "off";
}

/** In-app Ava dormant tips. Default on; set ENABLE_RETENTION_AVA=false to disable. */
export function isRetentionAvaEnabled(): boolean {
  if (falsy(process.env.ENABLE_RETENTION_AVA)) return false;
  if (truthy(process.env.ENABLE_RETENTION_AVA)) return true;
  return true;
}

/**
 * Weekly retention email. Default on in production when Resend is configured;
 * off when Resend is missing, in CI, or when ENABLE_RETENTION_EMAIL=false.
 */
export function isRetentionEmailEnabled(): boolean {
  if (process.env.GITHUB_ACTIONS === "true") return false;
  if (falsy(process.env.ENABLE_RETENTION_EMAIL)) return false;
  if (!process.env.RESEND_API_KEY?.trim()) return false;
  if (truthy(process.env.ENABLE_RETENTION_EMAIL)) return true;
  return process.env.NODE_ENV === "production";
}
