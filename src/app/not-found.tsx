import Link from "next/link";

/**
 * App-wide 404 — required so Next can recover cleanly when a route is missing
 * or when the build falls back during error recovery.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-[0.12em] text-accent">
        404
      </p>
      <h1 className="mt-3 font-display text-3xl tracking-tight text-ink">
        Page not found
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
        That link may be outdated, or the page may have moved. You can return
        home and continue from there.
      </p>
      <Link href="/" className="ui-btn ui-btn-primary mt-6">
        Go home
      </Link>
    </div>
  );
}
