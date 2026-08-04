"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

type AvaSize = "sm" | "md" | "lg";

type AvaProps = {
  className?: string;
  size?: AvaSize;
  /**
   * When true (default), treated as decorative beside a visible “Ava” label.
   * Pass false with a title for standalone icon buttons.
   */
  decorative?: boolean;
  /** Accessible name when decorative is false. */
  title?: string;
};

const SIZE: Record<AvaSize, string> = {
  sm: "size-9",
  md: "size-16",
  lg: "size-[5.5rem]",
};

/**
 * Ava — friendly cartoon placeholder avatar for the guided helper.
 * Swap the SVG later for a final illustration; keep this API stable.
 */
export function Ava({
  className,
  size = "md",
  decorative = true,
  title = "Ava",
}: AvaProps) {
  const uid = useId().replace(/:/g, "");
  const skinId = `ava-skin-${uid}`;
  const hairId = `ava-hair-${uid}`;
  const cheekId = `ava-cheek-${uid}`;
  const glowId = `ava-glow-${uid}`;

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        "bg-[color-mix(in_srgb,var(--color-accent)_12%,var(--color-canvas))]",
        "ring-1 ring-ink/8",
        SIZE[size],
        className,
      )}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : title}
      title={decorative ? undefined : title}
    >
      <svg
        viewBox="0 0 96 96"
        className="h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        focusable="false"
      >
        <defs>
          <radialGradient id={glowId} cx="50%" cy="42%" r="55%">
            <stop offset="0%" stopColor="#fff6ea" />
            <stop offset="100%" stopColor="#ead7c0" stopOpacity="0.35" />
          </radialGradient>
          <radialGradient id={skinId} cx="36%" cy="28%" r="72%">
            <stop offset="0%" stopColor="#f8e2cc" />
            <stop offset="55%" stopColor="#e9c5a4" />
            <stop offset="100%" stopColor="#d4a574" />
          </radialGradient>
          <linearGradient id={hairId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6a4634" />
            <stop offset="100%" stopColor="#3a2418" />
          </linearGradient>
          <linearGradient id={cheekId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef9b8a" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ef9b8a" stopOpacity="0" />
          </linearGradient>
        </defs>

        <circle cx="48" cy="48" r="48" fill={`url(#${glowId})`} />

        {/* Hair back */}
        <ellipse cx="48" cy="44" rx="33" ry="34" fill={`url(#${hairId})`} />

        {/* Face */}
        <ellipse cx="48" cy="52" rx="25" ry="27" fill={`url(#${skinId})`} />

        {/* Bangs */}
        <path
          d="M23 44c6-22 44-22 50 0-8-12-42-12-50 0z"
          fill={`url(#${hairId})`}
        />
        <path
          d="M31 36c7 9 10 6 17-3 7 9 10 12 17 3-6-12-28-12-34 0z"
          fill={`url(#${hairId})`}
        />

        {/* Cheeks */}
        <ellipse cx="33" cy="58" rx="5" ry="3.5" fill={`url(#${cheekId})`} />
        <ellipse cx="63" cy="58" rx="5" ry="3.5" fill={`url(#${cheekId})`} />

        {/* Eyes */}
        <ellipse cx="38" cy="52" rx="3.1" ry="3.8" fill="#2a2420" />
        <ellipse cx="58" cy="52" rx="3.1" ry="3.8" fill="#2a2420" />
        <circle cx="39.1" cy="50.7" r="1" fill="#fff" />
        <circle cx="59.1" cy="50.7" r="1" fill="#fff" />

        {/* Smile */}
        <path
          d="M40 63.5q8 5.5 16 0"
          fill="none"
          stroke="#8b5a45"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Soft sparkle */}
        <path
          d="M77 26l1.4 3.6 3.6 1.4-3.6 1.4L77 36l-1.4-3.6-3.6-1.4 3.6-1.4z"
          fill="#c9a66a"
          opacity="0.85"
        />
      </svg>
    </span>
  );
}

/** @deprecated Prefer `Ava` — kept so older imports keep working. */
export const AvaCartoon = Ava;
