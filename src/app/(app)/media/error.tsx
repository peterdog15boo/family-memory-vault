"use client";

import Link from "next/link";

/**
 * Photos library error — Safari often retries failed navigations; keep recovery obvious.
 */
export default function MediaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="app-page mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="font-display text-2xl tracking-tight text-ink">
        Photos couldn&apos;t load
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
        Your uploads are still safe. This page hit a temporary error while
        preparing previews — try again, or open your dashboard first.
      </p>
      {error.digest ? (
        <p className="mt-2 text-xs text-ink-muted">Reference: {error.digest}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={() => reset()} className="ui-btn ui-btn-primary">
          Try again
        </button>
        <Link href="/dashboard" className="ui-btn ui-btn-secondary">
          Back to vault
        </Link>
      </div>
    </div>
  );
}
