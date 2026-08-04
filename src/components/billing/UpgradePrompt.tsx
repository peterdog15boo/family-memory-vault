import Link from "next/link";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type UpgradePromptProps = {
  title?: string;
  message: string;
  hint?: string;
  className?: string;
  href?: string;
  secondaryHref?: string;
  ctaLabel?: string;
  secondaryCtaLabel?: string;
  /** warning = approaching limit; blocked = hard limit reached. */
  variant?: "upgrade" | "warning" | "blocked";
};

/**
 * Friendly upgrade banner used when a plan gate blocks an action.
 */
export function UpgradePrompt({
  title,
  message,
  hint,
  className,
  href = "/pricing",
  secondaryHref = "/billing",
  ctaLabel = "View plans",
  secondaryCtaLabel = "See usage",
  variant = "upgrade",
}: UpgradePromptProps) {
  const isBlocked = variant === "blocked";
  const isWarning = variant === "warning";

  const resolvedTitle =
    title ??
    (isBlocked
      ? "You've reached your limit"
      : isWarning
        ? "You're getting close to your limit"
        : "Upgrade to unlock");

  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border px-4 py-3 text-sm",
        isBlocked
          ? "border-rose-200/90 bg-rose-50/80 text-rose-950"
          : "border-amber-200/90 bg-amber-50/80 text-amber-950",
        className,
      )}
      role="status"
    >
      <Sparkles
        className={cn(
          "mt-0.5 size-4 shrink-0",
          isBlocked ? "text-rose-700" : "text-amber-700",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{resolvedTitle}</p>
        <p
          className={cn(
            "mt-0.5 leading-relaxed",
            isBlocked ? "text-rose-900/90" : "text-amber-900/90",
          )}
        >
          {message}
        </p>
        {hint ? (
          <p
            className={cn(
              "mt-1 text-xs leading-relaxed",
              isBlocked ? "text-rose-800/80" : "text-amber-800/80",
            )}
          >
            {hint}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <Link
            href={href}
            className="inline-flex text-sm font-medium text-accent-deep underline-offset-2 hover:text-accent hover:underline"
          >
            {ctaLabel}
          </Link>
          <Link
            href={secondaryHref}
            className="inline-flex text-sm font-medium text-accent-deep underline-offset-2 hover:text-accent hover:underline"
          >
            {secondaryCtaLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
