"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

type AskAiAvatarSize = "sm" | "md" | "lg";

type AskAiAvatarProps = {
  className?: string;
  size?: AskAiAvatarSize;
  /**
   * When true (default), treated as decorative beside a visible “Ask AI” label.
   * Pass false with a title for standalone icon buttons.
   */
  decorative?: boolean;
  /** Accessible name when decorative is false. */
  title?: string;
};

const SIZE: Record<AskAiAvatarSize, string> = {
  sm: "size-9",
  md: "size-16",
  lg: "size-[5.5rem]",
};

/**
 * Ask AI — friendly robot avatar (distinct from Ava’s human cartoon).
 * Darker robot on a light badge for clear contrast on warm canvas panels.
 */
export function AskAiAvatar({
  className,
  size = "md",
  decorative = true,
  title = "Ask AI",
}: AskAiAvatarProps) {
  const uid = useId().replace(/:/g, "");
  const faceId = `askai-face-${uid}`;
  const visorId = `askai-visor-${uid}`;
  const earId = `askai-ear-${uid}`;
  const highlightId = `askai-hi-${uid}`;

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        "bg-[#f7faf9]",
        "ring-2 ring-ink/18 ring-offset-1 ring-offset-canvas",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]",
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
          <linearGradient id={faceId} x1="0.2" y1="0" x2="0.85" y2="1">
            <stop offset="0%" stopColor="#5f727c" />
            <stop offset="45%" stopColor="#3f4f58" />
            <stop offset="100%" stopColor="#2a363d" />
          </linearGradient>
          <linearGradient id={earId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6a7c86" />
            <stop offset="100%" stopColor="#334149" />
          </linearGradient>
          <linearGradient id={visorId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7ec8b8" />
            <stop offset="100%" stopColor="#3d8f7d" />
          </linearGradient>
          <linearGradient id={highlightId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Soft light disc behind robot */}
        <circle cx="48" cy="48" r="46" fill="#eef4f2" />

        {/* Antenna */}
        <rect x="46" y="10" width="4" height="14" rx="2" fill="#2f3c43" />
        <circle cx="48" cy="10" r="5.4" fill="#3d8f7d" />
        <circle cx="48" cy="10" r="2.4" fill="#d8fff4" />

        {/* Ears */}
        <rect x="15" y="41" width="9" height="18" rx="4.5" fill={`url(#${earId})`} />
        <rect x="72" y="41" width="9" height="18" rx="4.5" fill={`url(#${earId})`} />

        {/* Head */}
        <rect
          x="22"
          y="26"
          width="52"
          height="50"
          rx="16"
          fill={`url(#${faceId})`}
        />
        <rect
          x="26"
          y="30"
          width="44"
          height="14"
          rx="7"
          fill={`url(#${highlightId})`}
        />

        {/* Visor / eyes — bright against dark face */}
        <rect
          x="30"
          y="42"
          width="36"
          height="16"
          rx="8"
          fill={`url(#${visorId})`}
        />
        <ellipse cx="40" cy="50" rx="4.5" ry="5.2" fill="#f4fffb" />
        <ellipse cx="56" cy="50" rx="4.5" ry="5.2" fill="#f4fffb" />
        <circle cx="41.3" cy="48.5" r="1.55" fill="#1a2e2a" />
        <circle cx="57.3" cy="48.5" r="1.55" fill="#1a2e2a" />

        {/* Soft cheeks */}
        <ellipse cx="32" cy="64" rx="4.2" ry="2.8" fill="#ef9b8a" opacity="0.45" />
        <ellipse cx="64" cy="64" rx="4.2" ry="2.8" fill="#ef9b8a" opacity="0.45" />

        {/* Smile */}
        <path
          d="M40 68.5q8 5 16 0"
          fill="none"
          stroke="#d7e2e8"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
