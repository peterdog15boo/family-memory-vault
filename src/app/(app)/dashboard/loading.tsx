/** Prevent a blank /dashboard while the authenticated shell compiles. */
export default function DashboardLoading() {
  return (
    <main
      className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center"
      aria-busy="true"
      aria-live="polite"
    >
      <p className="text-sm text-ink-muted">Loading…</p>
    </main>
  );
}
