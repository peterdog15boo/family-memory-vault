import type { PlanSlug } from "@/lib/db/schema";
import { getAppUrl as resolveAppUrl } from "@/lib/env";

export type BillingInterval = "monthly" | "yearly";

export type PaidPlanSlug = Extract<PlanSlug, "family" | "family_plus">;

export type StripePriceRef = {
  planSlug: PaidPlanSlug;
  interval: BillingInterval;
  priceId: string;
};

/**
 * True when Stripe secret key is present. Free plan works without this.
 */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function requireStripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to .env.local to enable billing.",
    );
  }
  return key;
}

export function getStripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || null;
}

export function getAppUrl(): string {
  return resolveAppUrl();
}

/**
 * Env-mapped Stripe Price IDs for paid plans.
 * Create matching Prices in the Stripe Dashboard (monthly + yearly).
 */
export function getStripePriceCatalog(): StripePriceRef[] {
  const entries: Array<{
    planSlug: PaidPlanSlug;
    interval: BillingInterval;
    env: string;
  }> = [
    {
      planSlug: "family",
      interval: "monthly",
      env: "STRIPE_PRICE_FAMILY_MONTHLY",
    },
    {
      planSlug: "family",
      interval: "yearly",
      env: "STRIPE_PRICE_FAMILY_YEARLY",
    },
    {
      planSlug: "family_plus",
      interval: "monthly",
      env: "STRIPE_PRICE_FAMILY_PLUS_MONTHLY",
    },
    {
      planSlug: "family_plus",
      interval: "yearly",
      env: "STRIPE_PRICE_FAMILY_PLUS_YEARLY",
    },
  ];

  const out: StripePriceRef[] = [];
  for (const entry of entries) {
    const priceId = process.env[entry.env]?.trim();
    if (priceId) {
      out.push({
        planSlug: entry.planSlug,
        interval: entry.interval,
        priceId,
      });
    }
  }
  return out;
}

export function resolvePriceId(
  planSlug: PaidPlanSlug,
  interval: BillingInterval,
): string | null {
  const match = getStripePriceCatalog().find(
    (p) => p.planSlug === planSlug && p.interval === interval,
  );
  return match?.priceId ?? null;
}

export function resolvePlanFromPriceId(
  priceId: string | null | undefined,
): StripePriceRef | null {
  if (!priceId) return null;
  return (
    getStripePriceCatalog().find((p) => p.priceId === priceId) ?? null
  );
}

export function isPaidPlanSlug(value: string): value is PaidPlanSlug {
  return value === "family" || value === "family_plus";
}

export function isBillingInterval(value: string): value is BillingInterval {
  return value === "monthly" || value === "yearly";
}
