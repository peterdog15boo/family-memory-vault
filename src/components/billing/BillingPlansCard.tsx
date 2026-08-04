"use client";

import { useMemo, useState, useTransition } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { PLAN_CATALOG } from "@/lib/plans/catalog";
import type { BillingInterval, PaidPlanSlug } from "@/lib/stripe/config";
import { userFacingApiError } from "@/lib/http/user-messages";
import { cn } from "@/lib/utils";

export type BillingPlansCardProps = {
  currentPlanSlug: string;
  currentPlanName: string;
  billingInterval: string | null;
  /** User already has a Stripe customer / paid sub — show portal. */
  canManageBilling: boolean;
  stripeConfigured: boolean;
  notice?: string | null;
};

const PAID = PLAN_CATALOG.filter(
  (p) => p.slug === "family" || p.slug === "family_plus",
);

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/**
 * Plan picker + Stripe Checkout / Customer Portal actions.
 * Free works without Stripe; paid CTAs degrade gracefully when unset.
 */
export function BillingPlansCard({
  currentPlanSlug,
  currentPlanName,
  billingInterval,
  canManageBilling,
  stripeConfigured,
  notice,
}: BillingPlansCardProps) {
  const [interval, setInterval] = useState<BillingInterval>(
    billingInterval === "yearly" ? "yearly" : "monthly",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const isPaidCurrent =
    currentPlanSlug === "family" || currentPlanSlug === "family_plus";

  const subtitle = useMemo(() => {
    if (currentPlanSlug === "free") {
      return "You're on Free — no card required.";
    }
    if (currentPlanSlug === "legacy") {
      return "Legacy plan — grandfathered limits, no checkout needed.";
    }
    const intervalLabel =
      billingInterval === "yearly"
        ? "yearly"
        : billingInterval === "monthly"
          ? "monthly"
          : null;
    return intervalLabel
      ? `Current: ${currentPlanName} (${intervalLabel})`
      : `Current: ${currentPlanName}`;
  }, [billingInterval, currentPlanName, currentPlanSlug]);

  function runCheckout(planSlug: PaidPlanSlug) {
    setError(null);
    setBusy(`checkout-${planSlug}`);
    startTransition(async () => {
      try {
        const response = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planSlug, interval }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          url?: string;
          error?: string;
          code?: string;
        };
        if (!response.ok || !data.url) {
          throw new Error(
            userFacingApiError(data, "Could not start checkout."),
          );
        }
        window.location.href = data.url;
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Checkout failed. Please try again.",
        );
        setBusy(null);
      }
    });
  }

  function openPortal() {
    setError(null);
    setBusy("portal");
    startTransition(async () => {
      try {
        const response = await fetch("/api/billing/portal", {
          method: "POST",
        });
        const data = (await response.json().catch(() => ({}))) as {
          url?: string;
          error?: string;
          code?: string;
        };
        if (!response.ok || !data.url) {
          throw new Error(
            userFacingApiError(data, "Could not open billing portal."),
          );
        }
        window.location.href = data.url;
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not open billing portal. Please try again.",
        );
        setBusy(null);
      }
    });
  }

  return (
    <section
      id="billing"
      className="surface-card billing-card rounded-2xl border border-ink/10 bg-canvas/80 px-5 py-5"
      aria-labelledby="billing-heading"
    >
      <div className="flex items-start gap-4">
        <span className="mt-0.5 rounded-md bg-accent/15 p-2 text-accent-deep">
          <CreditCard className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="billing-heading"
            className="font-display text-lg tracking-tight text-ink"
          >
            Plan &amp; billing
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            {subtitle}
          </p>

          {notice ? (
            <p className="mt-3 rounded-md border border-accent/25 bg-accent/10 px-3 py-2 text-sm text-accent-deep">
              {notice}
            </p>
          ) : null}

          {!stripeConfigured ? (
            <p className="mt-3 text-sm text-ink-muted">
              Paid upgrades need Stripe keys in{" "}
              <code className="text-xs">.env.local</code>. Free continues to
              work without them.
            </p>
          ) : null}

          <div className="mt-4 inline-flex rounded-lg border border-ink/10 bg-canvas-deep/50 p-1">
            {(["monthly", "yearly"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setInterval(value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition",
                  interval === value
                    ? "bg-canvas text-ink shadow-sm"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                {value === "monthly" ? "Monthly" : "Yearly"}
                {value === "yearly" ? (
                  <span className="ml-1 text-xs text-accent-deep">save</span>
                ) : null}
              </button>
            ))}
          </div>

          <ul className="mt-4 space-y-3">
            {PAID.map((plan) => {
              const price =
                interval === "yearly"
                  ? plan.priceYearlyCents
                  : plan.priceMonthlyCents;
              const isCurrent =
                currentPlanSlug === plan.slug && billingInterval === interval;
              const busyKey = `checkout-${plan.slug}`;
              return (
                <li
                  key={plan.slug}
                  className="flex flex-col gap-3 rounded-xl border border-ink/10 bg-canvas px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {plan.name}
                      {currentPlanSlug === plan.slug ? (
                        <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 text-[11px] font-medium text-accent-deep">
                          Current
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {formatCents(price)}
                      {interval === "yearly" ? "/year" : "/month"}
                      {" · "}
                      {plan.maxFamilyMembers} members ·{" "}
                      {plan.maxMoviesPerMonth} movies/mo
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={
                      !stripeConfigured ||
                      pending ||
                      isCurrent ||
                      currentPlanSlug === "legacy"
                    }
                    onClick={() => runCheckout(plan.slug as PaidPlanSlug)}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === busyKey ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : null}
                    {isCurrent
                      ? "Selected"
                      : currentPlanSlug === plan.slug
                        ? `Switch to ${interval}`
                        : "Upgrade"}
                  </button>
                </li>
              );
            })}
          </ul>

          {stripeConfigured && (canManageBilling || isPaidCurrent) ? (
            <button
              type="button"
              disabled={pending}
              onClick={openPortal}
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-accent-deep hover:text-accent disabled:opacity-60"
            >
              {busy === "portal" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              Manage billing in Stripe
            </button>
          ) : null}

          {error ? (
            <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
