import type { ReactNode } from "react";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";

type LibrarySectionProps = {
  title: string;
  description?: string;
  count?: number;
  /** Visually mark the family-shared section. */
  variant?: "own" | "shared";
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Consistent My Library / Shared with Family section chrome.
 */
export function LibrarySection({
  title,
  description,
  count,
  variant = "own",
  actions,
  children,
  className,
}: LibrarySectionProps) {
  return (
    <section className={cn("library-section mt-10", className)}>
      <div className="library-section-header mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl tracking-tight text-ink">
              {title}
            </h2>
            {variant === "shared" ? (
              <span className="library-section-badge inline-flex items-center gap-1 rounded-md bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent-deep">
                <Users className="size-3" aria-hidden />
                Family
              </span>
            ) : null}
          </div>
          {description ? (
            <p className="library-section-desc mt-1 max-w-xl text-sm leading-relaxed text-ink-muted">
              {description}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {typeof count === "number" && count > 0 ? (
            <p className="text-xs text-ink-muted">
              {count} item{count === 1 ? "" : "s"}
            </p>
          ) : null}
          {actions}
        </div>
      </div>
      {children}
    </section>
  );
}
