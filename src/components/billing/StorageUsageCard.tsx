"use client";

import Link from "next/link";
import { HardDrive } from "lucide-react";
import { useFormat } from "@/components/i18n/LocaleProvider";
import {
  formatBytes,
  type StorageQuotaSnapshot,
} from "@/lib/billing/quotas";
import {
  USAGE_WARNING_PERCENT,
  getUsageLevel,
} from "@/lib/billing/usage-thresholds";
import { cn } from "@/lib/utils";

type StorageUsageCardProps = {
  snapshot: StorageQuotaSnapshot;
  /** Compact strip for dashboard; full for settings. */
  variant?: "full" | "compact";
  className?: string;
};

/**
 * Shows plan storage usage, e.g. “142 GB of 300 GB used”.
 */
export function StorageUsageCard({
  snapshot,
  variant = "full",
  className,
}: StorageUsageCardProps) {
  const format = useFormat();
  const pct = snapshot.percentUsed;
  const level = getUsageLevel(pct);
  const nearLimit = level === "warning";
  const atLimit = level === "critical";
  const barWidth = pct == null ? 0 : Math.min(100, Math.max(0, pct));

  function formatRemaining(s: StorageQuotaSnapshot): string {
    if (s.remainingBytes == null) return "unlimited";
    return formatBytes(s.remainingBytes, 1, format.locale);
  }

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex flex-col gap-2 rounded-xl border border-ink/10 bg-canvas/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
          className,
        )}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{snapshot.label}</p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {snapshot.planName} plan
            {snapshot.remainingBytes != null
              ? ` · ${formatRemaining(snapshot)} left`
              : " · unlimited"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pct != null ? (
            <div
              className="h-1.5 w-28 overflow-hidden rounded-full bg-ink/10"
              role="progressbar"
              aria-valuenow={Math.round(pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Storage used"
            >
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  atLimit
                    ? "bg-red-600"
                    : nearLimit
                      ? "bg-amber-600"
                      : "bg-accent",
                )}
                style={{ width: `${barWidth}%` }}
              />
            </div>
          ) : null}
          <Link
            href="/billing"
            className="shrink-0 text-sm font-medium text-accent-deep hover:text-accent"
          >
            Details
          </Link>
        </div>
      </div>
    );
  }

  return (
    <section
      className={cn(
        "surface-card billing-card rounded-2xl border border-ink/10 bg-canvas/80 px-5 py-5",
        className,
      )}
      aria-labelledby="storage-usage-heading"
    >
      <div className="flex items-start gap-4">
        <span className="mt-0.5 rounded-md bg-accent/15 p-2 text-accent-deep">
          <HardDrive className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id="storage-usage-heading"
            className="font-display text-lg tracking-tight text-ink"
          >
            Storage
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            {snapshot.planName} plan
            {snapshot.limitBytes == null
              ? " — no storage cap"
              : ` — uploads stop when you hit your limit`}
            .
          </p>

          <p className="mt-4 text-base font-medium text-ink">{snapshot.label}</p>

          {pct != null ? (
            <div className="mt-3">
              <div
                className="h-2 overflow-hidden rounded-full bg-ink/10"
                role="progressbar"
                aria-valuenow={Math.round(pct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Storage used"
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    atLimit
                      ? "bg-red-600"
                      : nearLimit
                        ? "bg-amber-600"
                        : "bg-accent",
                  )}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-ink-muted">
                {atLimit
                  ? "Storage full — free up space or upgrade to upload more."
                  : nearLimit
                    ? `Getting close (${USAGE_WARNING_PERCENT}%+) — ${formatRemaining(snapshot)} left.`
                    : snapshot.remainingBytes != null
                      ? `${formatRemaining(snapshot)} remaining.`
                      : null}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-ink-muted">
              Unlimited storage on this plan.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
