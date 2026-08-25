/** Quiet shell wait — keep copy minimal so normal logins don’t feel like onboarding. */
export default function AppLoading() {
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
