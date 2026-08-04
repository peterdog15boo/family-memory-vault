"use client";

import { Check } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import {
  APP_THEMES,
  APP_THEME_DESCRIPTIONS,
  APP_THEME_LABELS,
  type AppTheme,
} from "@/lib/theme/types";
import { cn } from "@/lib/utils";

type ThemeSwitcherProps = {
  /** denser control for the floating evaluator */
  compact?: boolean;
  className?: string;
};

/**
 * Choose Original vs Modern appearance. Fully reversible.
 */
export function ThemeSwitcher({ compact = false, className }: ThemeSwitcherProps) {
  const { theme, setTheme, ready } = useTheme();

  function select(next: AppTheme) {
    setTheme(next);
  }

  if (compact) {
    return (
      <div
        className={cn(
          "inline-flex rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] p-1 shadow-[var(--shadow-sm)]",
          className,
        )}
        role="group"
        aria-label="App theme"
      >
        {APP_THEMES.map((id) => {
          const active = theme === id;
          return (
            <button
              key={id}
              type="button"
              disabled={!ready}
              onClick={() => select(id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition",
                active
                  ? "bg-[color:var(--accent)] text-[color:var(--accent-foreground)] shadow-sm"
                  : "text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]",
              )}
              aria-pressed={active}
              aria-label={`${APP_THEME_LABELS[id]} theme`}
            >
              {APP_THEME_LABELS[id]}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="grid gap-3 sm:grid-cols-2">
        {APP_THEMES.map((id) => {
          const active = theme === id;
          return (
            <button
              key={id}
              type="button"
              disabled={!ready}
              onClick={() => select(id)}
              aria-pressed={active}
              aria-label={`Use ${APP_THEME_LABELS[id]} theme`}
              className={cn(
                "group relative rounded-[var(--radius-lg)] border px-4 py-4 text-left transition duration-200",
                "bg-[color:var(--surface)] hover:border-[color:var(--accent)]/40",
                active
                  ? "border-[color:var(--accent)] shadow-[var(--shadow-md)] ring-1 ring-[color:var(--accent)]/25"
                  : "border-[color:var(--border-subtle)] shadow-[var(--shadow-sm)]",
              )}
            >
              <span className="flex items-start justify-between gap-3">
                <span>
                  <span className="block font-display text-lg tracking-tight text-[color:var(--ink)]">
                    {APP_THEME_LABELS[id]}
                  </span>
                  <span className="mt-1.5 block text-sm leading-relaxed text-[color:var(--ink-muted)]">
                    {APP_THEME_DESCRIPTIONS[id]}
                  </span>
                </span>
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border transition",
                    active
                      ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-[color:var(--accent-foreground)]"
                      : "border-[color:var(--border-subtle)] text-transparent",
                  )}
                  aria-hidden
                >
                  <Check className="size-3.5" />
                </span>
              </span>
              <span
                className="mt-4 flex h-10 overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--border-subtle)]"
                aria-hidden
              >
                {id === "original" ? (
                  <>
                    <span className="w-1/3 bg-[#f3f1ec]" />
                    <span className="w-1/3 bg-[#4a7c6f]" />
                    <span className="w-1/3 bg-[#ebe7df]" />
                  </>
                ) : (
                  <>
                    <span className="w-1/3 bg-[#f7f6f4]" />
                    <span className="w-1/3 bg-[#b56f5e]" />
                    <span className="w-1/3 bg-[#efeeeb]" />
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-[color:var(--ink-muted)]">
        Your choice is saved on this device. You can switch back anytime —
        nothing about your memories or data changes.
      </p>
    </div>
  );
}
