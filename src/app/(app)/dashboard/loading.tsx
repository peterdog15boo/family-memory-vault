/** Prevent a blank /dashboard while the authenticated shell compiles. */
export default function DashboardLoading() {
  return (
    <main
      className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center"
      aria-busy="true"
      aria-live="polite"
    >
      <p className="font-display text-2xl tracking-tight text-ink">
        Opening your vault…
      </p>
      <p className="mt-2 max-w-sm text-sm text-ink-muted">
        This only takes a moment.
      </p>
    </main>
  );
}
