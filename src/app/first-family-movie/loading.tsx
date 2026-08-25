/**
 * Neutral placeholder while eligibility is decided server-side.
 * Must NOT look like the ritual (no black prep / “Your first family movie”)
 * — seasoned users who still hit this route briefly should never see ritual UI.
 */
export default function FirstFamilyMovieLoading() {
  return (
    <main
      className="flex min-h-[100dvh] flex-col items-center justify-center bg-[var(--background)] px-6 text-center"
      aria-busy="true"
      aria-live="polite"
    >
      <p className="font-display text-2xl tracking-tight text-ink">
        Just a moment…
      </p>
    </main>
  );
}
