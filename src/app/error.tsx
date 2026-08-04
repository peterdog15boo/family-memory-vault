"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Segment error UI — recovers from render failures without a blank screen.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="font-display text-3xl tracking-tight text-ink">
        Something went wrong
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
        This page hit an unexpected error. You can try again, or head back home.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="ui-btn ui-btn-primary"
        >
          Try again
        </button>
        <Link href="/" className="ui-btn ui-btn-secondary">
          Go home
        </Link>
      </div>
    </div>
  );
}
