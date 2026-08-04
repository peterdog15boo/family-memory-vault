"use client";

import { Heart } from "lucide-react";
import { MediaSection } from "@/components/media-section";

/**
 * Soft Digital Legacy welcome — media-backed intro above progress.
 * Atmosphere-only by default; optional assets via props.
 */
export function LegacyIntroBanner({
  imageSrc,
  videoSrc,
  posterSrc,
}: {
  imageSrc?: string | null;
  videoSrc?: string | null;
  posterSrc?: string | null;
} = {}) {
  return (
    <MediaSection
      treatment="legacyDusk"
      imageSrc={imageSrc}
      videoSrc={videoSrc}
      posterSrc={posterSrc}
      glass
      glassStrength="soft"
      className="legacy-intro rounded-2xl"
      contentClassName="p-1 sm:p-1.5"
      glassClassName="!shadow-none border-[color:var(--legacy-line)] bg-[color:var(--legacy-panel)]/75"
    >
      <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-[color:var(--legacy-muted)]">
        <Heart
          className="size-3.5 text-[color:var(--legacy-accent)]"
          aria-hidden
        />
        A gift of clarity
      </p>
      <h2 className="mt-2 font-display text-xl tracking-tight text-[color:var(--legacy-ink)] sm:text-2xl">
        Begin with what feels right
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-[color:var(--legacy-muted)] sm:text-[0.9375rem]">
        Digital Legacy is private to you — contacts, guidance, and messages for
        the people who may one day need them. There is no rush; every small step
        is an act of care.
      </p>
    </MediaSection>
  );
}
