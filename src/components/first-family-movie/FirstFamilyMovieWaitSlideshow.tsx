"use client";

import { useEffect, useState } from "react";
import {
  FFM_WAIT_SLIDE_MS,
  FIRST_FAMILY_MOVIE_WAIT_SLIDES,
} from "@/content/first-family-movie-wait-slides";
import { cn } from "@/lib/utils";

type Props = {
  progress: number;
  statusLabel: string;
};

/**
 * Slow, branded education slideshow while the first movie renders.
 * Parent swaps this out immediately when the movie is ready.
 */
export function FirstFamilyMovieWaitSlideshow({
  progress,
  statusLabel,
}: Props) {
  const [index, setIndex] = useState(0);
  const slide = FIRST_FAMILY_MOVIE_WAIT_SLIDES[index]!;

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % FIRST_FAMILY_MOVIE_WAIT_SLIDES.length);
    }, FFM_WAIT_SLIDE_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <main className="ffm-wait relative mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6 py-12 sm:px-8">
      <div
        key={slide.id}
        className="ffm-fade-in overflow-hidden rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface)] shadow-[0_20px_60px_rgba(20,14,10,0.12)]"
      >
        <div
          className="relative aspect-[16/10] overflow-hidden"
          style={{ background: slide.accent }}
        >
          {slide.imageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={slide.imageSrc}
              alt={slide.imageAlt || ""}
              className="h-full w-full object-cover opacity-90"
            />
          ) : null}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, transparent 40%, rgba(12,10,9,0.75) 100%)",
            }}
            aria-hidden
          />
          <p className="absolute bottom-3 left-4 font-sans text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-white/85">
            {slide.eyebrow}
          </p>
        </div>

        <div className="px-5 py-5 sm:px-6 sm:py-6">
          <h2 className="font-display text-[clamp(1.25rem,4vw,1.55rem)] leading-snug tracking-tight text-[color:var(--ink)]">
            {slide.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--ink-muted)]">
            {slide.body}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-1.5" aria-hidden>
        {FIRST_FAMILY_MOVIE_WAIT_SLIDES.map((s, i) => (
          <span
            key={s.id}
            className={cn(
              "h-1.5 rounded-full transition-all duration-700",
              i === index
                ? "w-5 bg-[color:var(--accent-deep)]"
                : "w-1.5 bg-[color:var(--border-subtle)]",
            )}
          />
        ))}
      </div>

      <div className="mt-8">
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--border-subtle)]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          aria-label="Movie progress"
        >
          <div
            className="ffm-progress-shimmer h-full rounded-full bg-[color:var(--accent-deep)] transition-[width] duration-500 ease-out"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
        <p className="ffm-wait-status mt-3 text-center text-sm text-[color:var(--ink-muted)]">
          {statusLabel}
        </p>
      </div>
    </main>
  );
}
