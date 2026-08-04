import Link from "next/link";
import { CalendarDays, Film, HardDrive } from "lucide-react";
import type { AccountUsageSummary } from "@/lib/billing/account-usage";
import { cn } from "@/lib/utils";

type AccountUsageOverviewProps = {
  summary: AccountUsageSummary;
  variant?: "full" | "compact";
  className?: string;
};

/**
 * Plan + storage + movies usage for billing/settings pages.
 */
export function AccountUsageOverview({
  summary,
  variant = "full",
  className,
}: AccountUsageOverviewProps) {
  if (variant === "compact") {
    return (
      <section
        className={cn(
          "surface-card billing-card rounded-2xl border border-ink/10 bg-canvas/80 px-5 py-5",
          className,
        )}
        aria-labelledby="usage-overview-heading"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              id="usage-overview-heading"
              className="font-display text-lg tracking-tight text-ink"
            >
              Your usage
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {summary.planName} plan
              {summary.billingInterval
                ? ` · ${summary.billingInterval}`
                : ""}
            </p>
          </div>
          <Link
            href="/billing"
            className="shrink-0 text-sm font-medium text-accent-deep hover:text-accent"
          >
            Billing details
          </Link>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <UsageMeterCompact
            icon={HardDrive}
            title="Storage"
            meter={summary.storageMeter}
          />
          <UsageMeterCompact
            icon={Film}
            title="Movies this month"
            meter={summary.movies}
            footer={`Resets ${summary.moviesPeriodResetLabel}`}
          />
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn("space-y-4", className)}
      aria-labelledby="account-usage-heading"
    >
      <div>
        <h2
          id="account-usage-heading"
          className="font-display text-xl tracking-tight text-ink"
        >
          Usage &amp; limits
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          How your {summary.planName} plan is being used right now.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <UsageMeterCard
          icon={HardDrive}
          title="Storage"
          meter={summary.storageMeter}
          planName={summary.planName}
        />
        <UsageMeterCard
          icon={Film}
          title="Movies this month"
          meter={summary.movies}
          planName={summary.planName}
          footer={`Resets ${summary.moviesPeriodResetLabel} (UTC)`}
        />
      </div>

      {summary.nextBillingLabel ? (
        <div className="billing-note flex items-start gap-3 rounded-xl border border-ink/10 bg-canvas/70 px-4 py-3">
          <CalendarDays
            className="mt-0.5 size-4 shrink-0 text-accent-deep"
            aria-hidden
          />
          <div>
            <p className="text-sm font-medium text-ink">Next billing date</p>
            <p className="mt-0.5 text-sm text-ink-muted">
              {summary.nextBillingLabel}
              {summary.billingInterval
                ? ` · ${summary.billingInterval} billing`
                : ""}
            </p>
          </div>
        </div>
      ) : summary.planSlug === "free" ? (
        <p className="text-sm text-ink-muted">
          You&apos;re on the Free plan — no recurring billing. Upgrade anytime
          for more storage and movies.
        </p>
      ) : null}
    </section>
  );
}

type MeterProps = {
  icon: typeof HardDrive;
  title: string;
  meter: AccountUsageSummary["storageMeter"];
  planName?: string;
  footer?: string;
};

function UsageMeterCard({ icon: Icon, title, meter, footer }: MeterProps) {
  const barWidth =
    meter.percentUsed == null
      ? 0
      : Math.min(100, Math.max(0, meter.percentUsed));

  return (
    <article className="surface-card billing-card rounded-2xl border border-ink/10 bg-canvas/80 px-5 py-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-md bg-accent/15 p-2 text-accent-deep">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg tracking-tight text-ink">
            {title}
          </h3>
          <p className="mt-2 text-base font-medium text-ink">{meter.label}</p>
          {meter.percentUsed != null ? (
            <div className="mt-3">
              <div
                className="h-2 overflow-hidden rounded-full bg-ink/10"
                role="progressbar"
                aria-valuenow={Math.round(meter.percentUsed)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${title} used`}
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    meterLevelBarClass(meter.level),
                  )}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          ) : null}
          {meter.detail ? (
            <p className="mt-2 text-xs leading-relaxed text-ink-muted">
              {meter.detail}
            </p>
          ) : null}
          {footer ? (
            <p className="mt-1 text-xs text-ink-muted">{footer}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function UsageMeterCompact({
  icon: Icon,
  title,
  meter,
  footer,
}: Omit<MeterProps, "planName">) {
  const barWidth =
    meter.percentUsed == null
      ? 0
      : Math.min(100, Math.max(0, meter.percentUsed));

  return (
    <div className="rounded-xl border border-ink/8 bg-canvas/60 px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-accent-deep" aria-hidden />
        <p className="text-sm font-medium text-ink">{title}</p>
      </div>
      <p className="mt-1 text-xs text-ink-muted">{meter.label}</p>
      {meter.percentUsed != null ? (
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10"
          role="progressbar"
          aria-valuenow={Math.round(meter.percentUsed)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${title} used`}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all",
              meterLevelBarClass(meter.level),
            )}
            style={{ width: `${barWidth}%` }}
          />
        </div>
      ) : null}
      {footer ? (
        <p className="mt-1.5 text-[11px] text-ink-muted">{footer}</p>
      ) : null}
    </div>
  );
}

function meterLevelBarClass(
  level: AccountUsageSummary["storageMeter"]["level"],
): string {
  if (level === "critical") return "bg-rose-600";
  if (level === "warning") return "bg-amber-600";
  return "bg-accent";
}
