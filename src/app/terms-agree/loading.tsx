/** Shared calm placeholder while Terms gate compiles. */
export default function TermsAgreeLoading() {
  return (
    <main
      className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center"
      aria-busy="true"
      aria-live="polite"
    >
      <p className="font-display text-2xl tracking-tight text-ink">
        Just a moment…
      </p>
      <p className="mt-2 max-w-sm text-sm text-ink-muted">
        Preparing the next step for your vault.
      </p>
    </main>
  );
}
