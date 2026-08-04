/**
 * Shared environment helpers and production boot checks.
 */

import { logger } from "@/lib/observability/logger";

function trim(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Canonical public app origin (no trailing slash).
 * Production requires NEXT_PUBLIC_APP_URL (https).
 */
export function getAppUrl(): string {
  const fromEnv =
    trim(process.env.NEXT_PUBLIC_APP_URL) || trim(process.env.APP_URL);
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  if (trim(process.env.VERCEL_URL)) {
    return `https://${process.env.VERCEL_URL!.replace(/\/+$/, "")}`;
  }

  return "http://localhost:3000";
}

function missing(name: string): boolean {
  return !trim(process.env[name]);
}

/**
 * Validate critical production configuration at process start.
 * Logs errors and throws so a misconfigured deploy fails fast.
 *
 * Soft warnings (moderation vendors, email) do not throw — ops should
 * still treat them as launch blockers for a family-safety product.
 */
export function assertProductionEnv(): void {
  if (!isProduction()) return;

  const errors: string[] = [];
  const warnings: string[] = [];

  const required = [
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
    "DATABASE_URL",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "WORKER_SECRET",
  ] as const;

  for (const key of required) {
    if (missing(key)) errors.push(`Missing required env: ${key}`);
  }

  if (missing("R2_ENDPOINT") && missing("R2_ACCOUNT_ID")) {
    errors.push("Set R2_ENDPOINT or R2_ACCOUNT_ID");
  }

  const appUrl = trim(process.env.NEXT_PUBLIC_APP_URL);
  if (!appUrl) {
    errors.push(
      "NEXT_PUBLIC_APP_URL is required in production (e.g. https://app.example.com)",
    );
  } else if (!appUrl.startsWith("https://")) {
    errors.push("NEXT_PUBLIC_APP_URL must use https:// in production");
  }

  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    errors.push(
      "NODE_TLS_REJECT_UNAUTHORIZED=0 is not allowed in production",
    );
  }

  if (process.env.ALLOW_INSECURE_TLS === "true") {
    errors.push("ALLOW_INSECURE_TLS=true is not allowed in production");
  }

  if (process.env.ALLOW_MODERATION_FORCE === "true") {
    errors.push(
      "ALLOW_MODERATION_FORCE must not be enabled in production",
    );
  }

  if (trim(process.env.MODERATION_FORCE_STATUS)) {
    errors.push(
      "MODERATION_FORCE_STATUS must not be set in production",
    );
  }

  if (trim(process.env.STRIPE_SECRET_KEY)) {
    if (missing("STRIPE_WEBHOOK_SECRET")) {
      errors.push(
        "STRIPE_WEBHOOK_SECRET is required when STRIPE_SECRET_KEY is set",
      );
    }
    if (appUrl && !appUrl.startsWith("https://")) {
      errors.push("Stripe checkout requires an https NEXT_PUBLIC_APP_URL");
    }
  }

  // Safety posture — warn loudly; do not crash so ops can stage infra first.
  if (process.env.AI_MODERATION_ENABLED !== "true") {
    warnings.push(
      "AI_MODERATION_ENABLED is not true — uploads will use mock scoring",
    );
  }
  if (process.env.PHOTODNA_ENABLED !== "true") {
    warnings.push(
      "PHOTODNA_ENABLED is not true — CSAM hash matching is off",
    );
  }
  if (process.env.NCMEC_REPORTING_ENABLED !== "true") {
    warnings.push(
      "NCMEC_REPORTING_ENABLED is not true — live CyberTipline reporting is off (keep false until legal approval)",
    );
  }
  if (missing("RESEND_API_KEY")) {
    warnings.push(
      "RESEND_API_KEY unset — transactional email will log instead of send",
    );
  }

  for (const warning of warnings) {
    logger.warn("env.production_warning", { message: warning });
  }

  if (errors.length > 0) {
    for (const message of errors) {
      logger.error("env.production_invalid", { message });
    }
    throw new Error(
      `Production environment invalid:\n- ${errors.join("\n- ")}`,
    );
  }

  logger.info("env.production_ok", {
    appUrl: getAppUrl(),
    stripe: Boolean(trim(process.env.STRIPE_SECRET_KEY)),
    aiModeration: process.env.AI_MODERATION_ENABLED === "true",
    photodna: process.env.PHOTODNA_ENABLED === "true",
    ncmec: process.env.NCMEC_REPORTING_ENABLED === "true",
  });
}
