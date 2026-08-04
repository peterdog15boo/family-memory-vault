import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
  className?: string;
  /** Tighter lead spacing for compact hubs (e.g. settings). */
  compact?: boolean;
};

/**
 * Authenticated page title cluster. Modern theme upgrades via `.page-header*`.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
  compact = false,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "page-header",
        actions
          ? "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
          : undefined,
        className,
      )}
    >
      <div className="page-header-copy min-w-0">
        <h1 className="page-title font-display text-3xl tracking-tight text-ink">
          {title}
        </h1>
        {description ? (
          <p
            className={cn(
              "page-lead max-w-xl text-base leading-relaxed text-ink-muted",
              compact ? "mt-3" : "mt-2 sm:mt-3",
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="page-header-actions flex flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
