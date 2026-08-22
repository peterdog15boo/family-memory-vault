"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Check, FlaskConical, Loader2, Sparkles } from "lucide-react";
import type { BillingInterval, PaidPlanSlug } from "@/lib/stripe/config";
import {
  formatCents,
  getBetaSelectablePlans,
  getPublicPlans,
  isPaidPublicPlan,
  planFeatureBullets,
  RECOMMENDED_PLAN_SLUG,
} from "@/lib/plans/pricing-display";
import {
  BETA_PLAN_BADGE,
  betaPlanSuccessMessage,
  isBetaPlanPickerEnabled,
} from "@/lib/billing/beta-flags";
import { useFormat } from "@/components/i18n/LocaleProvider";
import { announce } from "@/lib/a11y/announce";
import { cn } from "@/lib/utils";

type PricingGridProps = {
  currentPlanSlug?: string | null;
  isSignedIn: boolean;
  stripeConfigured: boolean;
  canManageBilling?: boolean;
  /** Compact layout for settings embed. */
  variant?: "page" | "embedded";
  /**
   * Server-resolved beta mode. When omitted, falls back to
   * NEXT_PUBLIC_BETA_PLAN_PICKER / feedback beta flag.
   */
  betaMode?: boolean;
  className?: string;
};

/**
 * Public plan comparison with monthly/yearly toggle and Checkout CTAs.
 * When beta plan picker is enabled, assigns plans with no Stripe charges.
 */
export function PricingGrid({
  currentPlanSlug = null,
  isSignedIn,
  stripeConfigured,
  canManageBilling = false,
  variant = "page",
  betaMode: betaModeProp,
  className,
}: PricingGridProps) {
  const format = useFormat();
  const router = useRouter();
  const betaMode =
    typeof betaModeProp === "boolean"
      ? betaModeProp
      : isBetaPlanPickerEnabled();
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [activePlanSlug, setActivePlanSlug] = useState<string | null>(
    currentPlanSlug,
  );
  const [pending, startTransition] = useTransition();
  const plans = betaMode ? getBetaSelectablePlans() : getPublicPlans();

  useEffect(() => {
    setActivePlanSlug(currentPlanSlug);
  }, [currentPlanSlug]);

  function runBetaAssign(planSlug: string) {
    if (!isSignedIn) {
      window.location.href = `/sign-up?redirect_url=${encodeURIComponent("/billing")}`;
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(`beta-${planSlug}`);
    startTransition(async () => {
      try {
        const response = await fetch("/api/billing/beta-assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planSlug }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
          planName?: string;
          planSlug?: string;
        };
        if (!response.ok) {
          throw new Error(data.error || "Could not update plan.");
        }
        const planName = data.planName || planSlug;
        const message =
          data.message ||
          betaPlanSuccessMessage(planName);
        setActivePlanSlug(data.planSlug || planSlug);
        setNotice(message);
        announce(message, { priority: "polite" });
        setBusy(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Plan update failed.");
        setBusy(null);
      }
    });
  }

  function runCheckout(planSlug: PaidPlanSlug) {
    if (!isSignedIn) {
      window.location.href = `/sign-up?redirect_url=${encodeURIComponent("/pricing")}`;
      return;
    }
    setError(null);
    setNotice(null);
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
          beta?: boolean;
          message?: string;
          planName?: string;
          planSlug?: string;
        };
        // Beta override short-circuits Checkout (no charge, no Stripe URL).
        if (response.ok && data.beta) {
          const planName = data.planName || planSlug;
          const message =
            data.message || betaPlanSuccessMessage(planName);
          setActivePlanSlug(data.planSlug || planSlug);
          setNotice(message);
          announce(message, { priority: "polite" });
          setBusy(null);
          router.refresh();
          return;
        }
        if (!response.ok || !data.url) {
          throw new Error(data.error || "Could not start checkout.");
        }
        window.location.href = data.url;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Checkout failed.");
        setBusy(null);
      }
    });
  }

  function openPortal() {
    setError(null);
    setBusy("portal");
    startTransition(async () => {
      try {
        const response = await fetch("/api/billing/portal", { method: "POST" });
        const data = (await response.json().catch(() => ({}))) as {
          url?: string;
          error?: string;
        };
        if (!response.ok || !data.url) {
          throw new Error(data.error || "Could not open billing portal.");
        }
        window.location.href = data.url;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Portal failed.");
        setBusy(null);
      }
    });
  }

  return (
    <div className={cn(className)}>
      {betaMode ? (
        <div className="mb-6 rounded-lg border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="flex items-center gap-2 font-semibold">
            <FlaskConical className="size-4 shrink-0" aria-hidden />
            {BETA_PLAN_BADGE}
          </p>
          <p className="mt-1 text-amber-950/90">
            Switch Free, Family, or Legacy+ anytime. Limits and gated features
            update immediately. No payment info is required — you will not be
            charged. Prices below are shown for context only.
          </p>
        </div>
      ) : null}

      {!betaMode ? (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <div
            className="inline-flex rounded-lg border border-ink/10 bg-canvas/80 p-1 shadow-sm"
            role="group"
            aria-label="Billing interval"
          >
            {(["monthly", "yearly"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setInterval(value)}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium transition",
                  interval === value
                    ? "bg-accent text-accent-foreground"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                {value === "monthly" ? "Monthly" : "Yearly"}
                {value === "yearly" ? (
                  <span
                    className={cn(
                      "ml-1.5 text-xs",
                      interval === value
                        ? "text-accent-foreground/85"
                        : "text-accent-deep",
                    )}
                  >
                    save ~17%
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <div
            className="inline-flex rounded-lg border border-ink/10 bg-canvas/80 p-1 shadow-sm"
            role="group"
            aria-label="Price display interval"
          >
            {(["monthly", "yearly"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setInterval(value)}
                className={cn(
                  "rounded-md px-4 py-2 text-sm font-medium transition",
                  interval === value
                    ? "bg-accent text-accent-foreground"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                {value === "monthly" ? "Monthly prices" : "Yearly prices"}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        className={cn(
          "mt-10 grid gap-5",
          variant === "page"
            ? betaMode
              ? "lg:grid-cols-3 lg:items-stretch"
              : "lg:grid-cols-3 lg:items-stretch"
            : betaMode
              ? "md:grid-cols-3"
              : "md:grid-cols-3",
        )}
      >
        {plans.map((plan, index) => {
          const recommended = plan.slug === RECOMMENDED_PLAN_SLUG;
          const isCurrent = activePlanSlug === plan.slug;
          const priceCents =
            plan.priceMonthlyCents === 0
              ? 0
              : interval === "yearly"
                ? plan.priceYearlyCents
                : plan.priceMonthlyCents;
          const bullets = planFeatureBullets(plan);
          const paid = isPaidPublicPlan(plan.slug);

          return (
            <article
              key={plan.slug}
              className={cn(
                "pricing-plan relative flex flex-col rounded-2xl border px-6 py-7 transition duration-500",
                recommended
                  ? "border-accent/45 bg-canvas shadow-[0_20px_50px_rgba(42,40,37,0.1)] lg:-translate-y-2 lg:scale-[1.02]"
                  : "border-ink/10 bg-canvas/75",
                isCurrent && "ring-2 ring-accent/40",
              )}
              style={{ animationDelay: `${0.08 * index}s` }}
            >
              {recommended ? (
                <p className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full bg-accent px-3 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-accent-foreground">
                  <Sparkles className="size-3" aria-hidden />
                  Recommended
                </p>
              ) : null}

              <header>
                <h3 className="font-display text-2xl tracking-tight text-ink">
                  {plan.name}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  {plan.description}
                </p>
              </header>

              <p className="mt-6 flex flex-wrap items-baseline gap-1">
                <span className="font-display text-4xl tracking-tight text-ink">
                  {formatCents(priceCents, format.locale)}
                </span>
                {priceCents > 0 ? (
                  <span className="text-sm text-ink-muted">
                    /{interval === "yearly" ? "year" : "month"}
                  </span>
                ) : (
                  <span className="text-sm text-ink-muted">forever</span>
                )}
                {betaMode && priceCents > 0 ? (
                  <span className="w-full text-xs font-medium text-amber-900">
                    Listed price — not charged in beta
                  </span>
                ) : null}
              </p>

              <ul className="mt-6 flex-1 space-y-2.5">
                {bullets.map((bullet) => (
                  <li
                    key={bullet}
                    className="flex gap-2 text-sm leading-snug text-ink"
                  >
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-accent"
                      aria-hidden
                    />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8">
                {isCurrent ? (
                  <div className="space-y-2">
                    <p className="rounded-md border border-accent/25 bg-accent/10 px-3 py-2.5 text-center text-sm font-medium text-accent-deep">
                      {betaMode ? "Current beta plan" : "Current plan"}
                    </p>
                    {betaMode ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => runBetaAssign(plan.slug)}
                        className="w-full text-center text-sm font-medium text-accent-deep hover:text-accent disabled:opacity-60"
                      >
                        {busy === `beta-${plan.slug}` ? (
                          <Loader2
                            className="mx-auto size-4 animate-spin"
                            aria-hidden
                          />
                        ) : (
                          "Confirm again (no charge)"
                        )}
                      </button>
                    ) : null}
                    {!betaMode && paid && canManageBilling && isSignedIn ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={openPortal}
                        className="w-full text-center text-sm font-medium text-accent-deep hover:text-accent disabled:opacity-60"
                      >
                        {busy === "portal" ? (
                          <Loader2
                            className="mx-auto size-4 animate-spin"
                            aria-hidden
                          />
                        ) : (
                          "Manage billing"
                        )}
                      </button>
                    ) : null}
                  </div>
                ) : betaMode ? (
                  <button
                    type="button"
                    disabled={pending || !isSignedIn}
                    onClick={() => runBetaAssign(plan.slug)}
                    className={cn(
                      "inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
                      recommended
                        ? "bg-accent text-accent-foreground hover:bg-accent-deep"
                        : "border border-ink/15 bg-canvas text-ink hover:border-accent/35 hover:bg-accent/10",
                    )}
                  >
                    {busy === `beta-${plan.slug}` ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : null}
                    {!isSignedIn
                      ? "Sign in to switch"
                      : `Use ${plan.name} (free in beta)`}
                  </button>
                ) : paid ? (
                  <button
                    type="button"
                    disabled={
                      pending ||
                      (isSignedIn && !stripeConfigured) ||
                      currentPlanSlug === "legacy"
                    }
                    onClick={() => {
                      if (isPaidPublicPlan(plan.slug)) {
                        runCheckout(plan.slug);
                      }
                    }}
                    className={cn(
                      "inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
                      recommended
                        ? "bg-accent text-accent-foreground hover:bg-accent-deep"
                        : "border border-ink/15 bg-canvas text-ink hover:border-accent/35 hover:bg-accent/10",
                    )}
                  >
                    {busy === `checkout-${plan.slug}` ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : null}
                    {!isSignedIn
                      ? "Sign up to upgrade"
                      : !stripeConfigured
                        ? "Billing coming soon"
                        : "Upgrade"}
                  </button>
                ) : (
                  <Link
                    href={isSignedIn ? "/dashboard" : "/sign-up"}
                    className="inline-flex w-full items-center justify-center rounded-md border border-ink/15 bg-canvas px-4 py-3 text-sm font-medium text-ink transition hover:border-accent/35 hover:bg-accent/10"
                  >
                    {isSignedIn ? "Go to your vault" : "Start free"}
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {notice ? (
        <p
          className="mx-auto mt-6 max-w-lg rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-sm text-emerald-900"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      {error ? (
        <p className="mx-auto mt-6 max-w-lg rounded-md border border-red-200 bg-red-50 px-3 py-2 text-center text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {!betaMode && isSignedIn && !stripeConfigured ? (
        <p className="mx-auto mt-4 max-w-lg text-center text-xs text-ink-muted">
          Stripe isn’t configured in this environment yet — Free still works.
        </p>
      ) : null}
    </div>
  );
}
