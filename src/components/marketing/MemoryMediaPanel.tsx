"use client";

import { cn } from "@/lib/utils";

const TONE_CLASS: Record<string, string> = {
  warm: "landing-media-warm",
  sage: "landing-media-sage",
  rose: "landing-media-rose",
  dusk: "landing-media-dusk",
};

/**
 * Soft memory media panel — optional image, or elegant atmospheric fallback.
 */
export function MemoryMediaPanel({
  tone = "warm",
  imageSrc,
  imageAlt = "",
  className,
}: {
  tone?: "warm" | "sage" | "rose" | "dusk";
  imageSrc?: string | null;
  imageAlt?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "landing-media-panel relative overflow-hidden",
        TONE_CLASS[tone] ?? TONE_CLASS.warm,
        className,
      )}
    >
      {imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element -- marketing editable paths
        <img
          src={imageSrc}
          alt={imageAlt}
          className="absolute inset-0 h-full w-full object-cover opacity-90"
        />
      ) : (
        <div className="landing-media-atmosphere absolute inset-0" aria-hidden />
      )}
      <div
        className="pointer-events-none absolute inset-0 landing-media-veil"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/10 to-transparent"
        aria-hidden
      />
    </div>
  );
}
