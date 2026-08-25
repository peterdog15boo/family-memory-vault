/** App-shell loading state — avoids a white flash on slow first navigations. */
export default function AppLoading() {
  return (
    <main
      className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center"
      aria-busy="true"
      aria-live="polite"
    >
      <p className="font-display text-2xl tracking-tight text-ink">
        Just a moment…
      </p>
      <p className="mt-2 max-w-sm text-sm text-ink-muted">
        Preparing your private vault.
      </p>
    </main>
  );
}
