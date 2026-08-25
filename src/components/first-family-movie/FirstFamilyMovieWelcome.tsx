"use client";

import { FirstFamilyMovieSkipButton } from "@/components/first-family-movie/FirstFamilyMovieSkipButton";

type Props = {
  onStart: () => void;
  /** Persist skip and leave the ritual. */
  onSkip: () => void;
  skipPending?: boolean;
};

/**
 * Welcome overlay only — collage backdrop lives in FirstFamilyMovieExperience
 * so it keeps scrolling across later ritual steps.
 */
export function FirstFamilyMovieWelcome({
  onStart,
  onSkip,
  skipPending = false,
}: Props) {
  return (
    <main className="ffm-welcome relative min-h-dvh text-[#f7f0e8]">
      <div className="absolute right-3 top-3 z-20 sm:right-5 sm:top-5">
        <FirstFamilyMovieSkipButton
          variant="header"
          onClick={onSkip}
          pending={skipPending}
        />
      </div>

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-end px-6 pb-12 pt-20 sm:justify-center sm:px-8 sm:pb-16">
        <p className="ffm-fade-in font-sans text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-[#e8c9a4]">
          Family Memory Vault
        </p>

        <h1 className="ffm-fade-in-delay-1 mt-5 font-display text-[clamp(1.9rem,7.5vw,2.85rem)] leading-[1.15] tracking-tight text-[#faf6f1] drop-shadow-[0_2px_24px_rgba(0,0,0,0.45)]">
          Welcome. Let’s make your first family movie together. It only takes a
          few minutes.
        </h1>

        <div className="ffm-fade-in-delay-2 mt-9 flex flex-col gap-3">
          <button
            type="button"
            onClick={onStart}
            disabled={skipPending}
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#b56f5e] px-6 text-base font-semibold text-white shadow-[0_12px_40px_rgba(181,111,94,0.35)] transition hover:bg-[#9d5d4e] sm:h-[3.25rem] sm:w-auto sm:min-w-[15rem] sm:self-start disabled:opacity-60"
          >
            Start My First Movie
          </button>
          <FirstFamilyMovieSkipButton
            onClick={onSkip}
            pending={skipPending}
          />
          <p className="max-w-sm text-xs leading-relaxed text-white/60">
            We’ll only use these photos for this experience. You stay in full
            control. Skip anytime — you can make a movie later from your vault.
          </p>
        </div>
      </div>
    </main>
  );
}
