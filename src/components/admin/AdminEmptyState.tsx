import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

type AdminEmptyStateProps = {
  title: string;
  description: string;
  icon?: LucideIcon;
  actionHref?: string;
  actionLabel?: string;
  className?: string;
};

/**
 * Consistent empty state for admin list / queue surfaces.
 */
export function AdminEmptyState({
  title,
  description,
  icon: Icon = Inbox,
  actionHref,
  actionLabel,
  className,
}: AdminEmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-ink/15 bg-canvas-deep/30 px-6 py-12 text-center",
        className,
      )}
    >
      <Icon className="mx-auto size-8 text-ink/25" aria-hidden />
      <p className="mt-4 font-display text-xl text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
        {description}
      </p>
      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="mt-5 inline-block text-sm font-medium text-accent-deep hover:underline"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
