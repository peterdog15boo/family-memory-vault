"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowUpRight, CreditCard, Loader2 } from "lucide-react";
import { BETA_PLAN_BADGE, isBetaPlanPickerEnabled } from "@/lib/billing/beta-flags";
import { cn } from "@/lib/utils";

type CurrentPlanBadgeProps = {
  planName: string;
  planSlug: string;
  billingInterval?: string | null;
  planSource?: string | null;
  canManageBilling: boolean;
  stripeConfigured: boolean;
  /** Server-resolved beta mode (preferred over client env alone). */
  betaMode?: boolean;
  variant?: "dashboard" | "compact";
  className?: string;
};

/**
 * Shows the user’s plan with Upgrade or Manage Billing actions.
 */
export function CurrentPlanBadge({
  planName,
  planSlug,
  billingInterval,
  planSource = null,
  canManageBilling,
  stripeConfigured,
  betaMode: betaModeProp,
  variant = "dashboard",
  className,
}: CurrentPlanBadgeProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const betaMode =
    typeof betaModeProp === "boolean"
      ? betaModeProp
      : isBetaPlanPickerEnabled();
  const isPaid =
    planSlug === "family" ||
    planSlug === "family_plus" ||
    planSlug === "legacy";
  const isBetaPlan = planSource === "beta" || betaMode;
  const showManage =
    isPaid && canManageBilling && stripeConfigured && !isBetaPlan && !betaMode;

  function openPortal() {
    setError(null);
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
      }
    });
  }

  const intervalLabel =
    billingInterval === "yearly"
      ? " · yearly"
      : billingInterval === "monthly"
        ? " · monthly"
        : "";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-ink/10 bg-canvas/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 rounded-md bg-accent/15 p-2 text-accent-deep">
          <CreditCard className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {planName} plan
            <span className="font-normal text-ink-muted">{intervalLabel}</span>
            {isBetaPlan ? (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950">
                Beta
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {betaMode || planSource === "beta"
              ? BETA_PLAN_BADGE
              : planSlug === "free"
                ? "Upgrade anytime for more storage, family seats, and movies."
                : planSlug === "legacy"
                  ? "Legacy+ includes Digital Legacy, Private Documents, and Connected Accounts."
                  : "You’re on a paid plan. Change or cancel anytime."}
          </p>
          {error ? (
            <p className="mt-1 text-xs text-red-700">{error}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {showManage ? (
          <button
            type="button"
            disabled={pending}
            onClick={openPortal}
            className="inline-flex items-center gap-1.5 rounded-md border border-ink/12 bg-canvas px-3 py-2 text-sm font-medium text-ink transition hover:border-accent/30 hover:bg-accent/10 disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : null}
            Manage billing
          </button>
        ) : null}
        {betaMode ? (
          <Link
            href="/billing"
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition hover:bg-accent-deep"
          >
            Switch plans
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        ) : planSlug !== "legacy" && planSlug !== "family_plus" ? (
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground transition hover:bg-accent-deep"
          >
            Upgrade
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        ) : planSlug === "family_plus" && !showManage ? (
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 rounded-md border border-ink/12 bg-canvas px-3 py-2 text-sm font-medium text-ink transition hover:border-accent/30 hover:bg-accent/10"
          >
            View plans
          </Link>
        ) : null}
        {variant === "dashboard" && planSlug === "legacy" && !betaMode ? (
          <Link
            href="/billing"
            className="text-sm font-medium text-accent-deep hover:text-accent"
          >
            Billing
          </Link>
        ) : null}
      </div>
    </div>
  );
}
