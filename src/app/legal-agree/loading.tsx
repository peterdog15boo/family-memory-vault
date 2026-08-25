/** Calm placeholder while the combined legal agreement loads. */
export default function LegalAgreeLoading() {
  return (
    <main
      className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#0c0a09] px-6 text-center text-[#f7f0e8]"
      aria-busy="true"
      aria-live="polite"
    >
      <p className="font-display text-2xl tracking-tight">Agreements</p>
      <p className="mt-2 max-w-sm text-sm text-white/60">Loading…</p>
    </main>
  );
}
