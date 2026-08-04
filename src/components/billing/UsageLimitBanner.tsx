import Link from "next/link";
import { AlertCircle, Sparkles } from "lucide-react";
import type {
  AccountUsageSummary,
  UsageWarning,
} from "@/lib/billing/account-usage";
import { cn } from "@/lib/utils";

type UsageLimitBannerProps = {
  summary: Pick<AccountUsageSummary, "warnings">;
  className?: string;
};

/**
 * Gentle warnings (80%+) and clear blocked-state banners for usage limits.
 */
export function UsageLimitBanner({ summary, className }: UsageLimitBannerProps) {
  if (summary.warnings.length === 0) return null;

  return (
    <div className={cn("space-y-3", className)}>
      {summary.warnings.map((warning) => (
        <UsageWarningCard key={warning.kind} warning={warning} />
      ))}
    </div>
  );
}

function UsageWarningCard({ warning }: { warning: UsageWarning }) {
  const isCritical = warning.level === "critical";

  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border px-4 py-3 text-sm",
        isCritical
          ? "border-rose-200/90 bg-rose-50/80 text-rose-950"
          : "border-amber-200/90 bg-amber-50/80 text-amber-950",
      )}
      role="status"
    >
      {isCritical ? (
        <AlertCircle
          className="mt-0.5 size-4 shrink-0 text-rose-700"
          aria-hidden
        />
      ) : (
        <Sparkles
          className="mt-0.5 size-4 shrink-0 text-amber-700"
          aria-hidden
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium">{warning.title}</p>
        <p
          className={cn(
            "mt-0.5 leading-relaxed",
            isCritical ? "text-rose-900/90" : "text-amber-900/90",
          )}
        >
          {warning.message}
        </p>
        <Link
          href="/billing"
          className="mt-2 mr-4 inline-flex text-sm font-medium text-accent-deep underline-offset-2 hover:text-accent hover:underline"
        >
          View usage &amp; plans
        </Link>
        {isCritical ? (
          <Link
            href="/pricing"
            className="mt-2 inline-flex text-sm font-medium text-accent-deep underline-offset-2 hover:text-accent hover:underline"
          >
            Upgrade plan
          </Link>
        ) : null}
      </div>
    </div>
  );
}
