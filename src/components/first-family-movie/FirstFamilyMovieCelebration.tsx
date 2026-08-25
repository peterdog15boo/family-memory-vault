"use client";

import { Images, Sparkles, Users } from "lucide-react";

type Props = {
  onAddPhotos: () => void;
  onInviteFamily: () => void;
  onEnterApp: () => void;
};

/**
 * Celebration close — emotional wrap of the First Family Movie ritual.
 */
export function FirstFamilyMovieCelebration({
  onAddPhotos,
  onInviteFamily,
  onEnterApp,
}: Props) {
  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6 py-14 sm:px-8">
      <p className="ffm-fade-in font-sans text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-deep)]">
        Nicely done
      </p>
      <h1 className="ffm-fade-in-delay-1 mt-5 font-display text-[clamp(1.85rem,7vw,2.65rem)] leading-[1.15] tracking-tight text-[color:var(--ink)]">
        You just made your first family movie.
      </h1>
      <p className="ffm-fade-in-delay-2 mt-4 max-w-md text-base leading-relaxed text-[color:var(--ink-muted)]">
        Your vault is ready. Keep the momentum going with a few more moments —
        or bring family in so the story grows together.
      </p>

      <div className="ffm-fade-in-delay-2 mt-10 flex flex-col gap-3">
        <button
          type="button"
          onClick={onAddPhotos}
          className="ui-btn ui-btn-primary inline-flex h-12 w-full items-center justify-center gap-2 px-6 text-base font-semibold"
        >
          <Images className="size-4" aria-hidden />
          Add more photos
        </button>
        <button
          type="button"
          onClick={onInviteFamily}
          className="ui-btn ui-btn-secondary inline-flex h-12 w-full items-center justify-center gap-2 px-6 text-base font-semibold"
        >
          <Users className="size-4" aria-hidden />
          Invite family members
        </button>
      </div>

      <p className="mt-8 flex gap-2 rounded-[var(--app-radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)]/80 px-4 py-3 text-sm leading-relaxed text-[color:var(--ink-muted)]">
        <Sparkles
          className="mt-0.5 size-4 shrink-0 text-[color:var(--accent-deep)]"
          aria-hidden
        />
        <span>
          Upload 20 more photos and we’ll make a longer Year in Review version.
        </span>
      </p>

      <button
        type="button"
        onClick={onEnterApp}
        className="mt-8 self-center text-sm font-medium text-[color:var(--accent-deep)] underline-offset-4 transition hover:underline"
      >
        Enter my vault
      </button>
    </main>
  );
}
