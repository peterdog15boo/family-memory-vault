import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Primary action */
  action?: {
    href: string;
    label: string;
    icon?: LucideIcon;
  };
  /** Secondary text link */
  secondaryAction?: {
    href: string;
    label: string;
  };
  className?: string;
  /** Slightly taller padding for page-level empties */
  size?: "default" | "large";
};

/**
 * Shared empty-state layout — warm, centered, one clear next step.
 * Modern theme upgrades via `.ui-empty` tokens; Original stays familiar.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  size = "default",
}: EmptyStateProps) {
  const ActionIcon = action?.icon;

  return (
    <div
      className={cn(
        "ui-empty",
        size === "large" ? "py-16" : undefined,
        className,
      )}
    >
      <span className="ui-empty-icon mx-auto inline-flex">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="ui-empty-title mt-4 font-display text-xl tracking-tight text-ink sm:text-2xl">
        {title}
      </p>
      <p className="ui-empty-copy mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted sm:text-[0.9875rem]">
        {description}
      </p>
      {action ? (
        <Link
          href={action.href}
          className="ui-btn ui-btn-primary mt-6"
        >
          {ActionIcon ? <ActionIcon className="size-4" aria-hidden /> : null}
          {action.label}
        </Link>
      ) : null}
      {secondaryAction ? (
        <p className="mt-3">
          <Link
            href={secondaryAction.href}
            className="ui-empty-secondary text-sm font-medium text-ink-muted underline-offset-2 transition hover:text-ink hover:underline"
          >
            {secondaryAction.label}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
