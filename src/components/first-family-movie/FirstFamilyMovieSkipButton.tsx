"use client";

import { cn } from "@/lib/utils";

type Props = {
  onClick: () => void;
  pending?: boolean;
  /** Full-width secondary under a primary CTA (welcome / major steps). */
  variant?: "button" | "header";
  className?: string;
};

/**
 * Clear, always-visible ritual exit. Marks the flow dismissed so it won’t return.
 */
export function FirstFamilyMovieSkipButton({
  onClick,
  pending = false,
  variant = "button",
  className,
}: Props) {
  const label = pending ? "Skipping…" : "Skip";

  if (variant === "header") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className={cn(
          "rounded-lg border border-current/25 bg-black/35 px-3.5 py-2 text-sm font-semibold tracking-wide text-[#f7f0e8] shadow-sm backdrop-blur-sm transition hover:bg-black/50 disabled:opacity-60",
          className,
        )}
      >
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={cn(
        "inline-flex h-11 w-full items-center justify-center rounded-xl border border-white/35 bg-white/10 px-6 text-sm font-semibold text-[#faf6f1] backdrop-blur-sm transition hover:bg-white/18 disabled:opacity-60 sm:w-auto sm:min-w-[10rem] sm:self-start",
        className,
      )}
    >
      {label}
    </button>
  );
}
