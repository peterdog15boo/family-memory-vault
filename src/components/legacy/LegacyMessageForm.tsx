"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import type { SerializedLegacyProfile } from "@/lib/legacy/serialize";

type LegacyMessageFormProps = {
  profile: SerializedLegacyProfile;
  /**
   * "standalone" — original full panel (title + intro).
   * "letter" — written half of the combined farewell packet.
   */
  variant?: "standalone" | "letter";
};

export function LegacyMessageForm({
  profile: initial,
  variant = "standalone",
}: LegacyMessageFormProps) {
  const router = useRouter();
  const [summaryMessage, setSummaryMessage] = useState(
    initial.summaryMessage ?? "",
  );
  const [generalInstructions, setGeneralInstructions] = useState(
    initial.generalInstructions ?? "",
  );
  const [funeralPreferences, setFuneralPreferences] = useState(
    initial.funeralPreferences ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch("/api/legacy/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summaryMessage: summaryMessage.trim() || null,
          generalInstructions: generalInstructions.trim() || null,
          funeralPreferences: funeralPreferences.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save your message.");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your message.");
    } finally {
      setBusy(false);
    }
  }

  const isLetter = variant === "letter";

  return (
    <form
      onSubmit={handleSubmit}
      className="legacy-vault-panel documents-vault-panel legacy-vault-in space-y-5 rounded-2xl p-5 sm:p-6"
    >
      <div>
        <h2
          className={
            isLetter
              ? "font-display text-xl tracking-tight text-[color:var(--legacy-ink)]"
              : "font-display text-xl tracking-tight text-[color:var(--legacy-ink)]"
          }
        >
          {isLetter ? "Write to them" : "Message to Loved Ones"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--legacy-muted)]">
          {isLetter
            ? "Words they can hold onto — a letter, a few paragraphs, or simple notes about what matters most. This sits beside your video as one farewell packet."
            : "Write in your own voice. This can be a letter, a few paragraphs, or simple notes about what matters most to you. You can also leave a spoken message in the video section below."}
        </p>
      </div>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--legacy-muted)]">
          {isLetter ? "Your letter" : "Your message"}
        </span>
        <textarea
          value={summaryMessage}
          onChange={(e) => setSummaryMessage(e.target.value)}
          rows={isLetter ? 8 : 10}
          maxLength={20000}
          disabled={busy}
          placeholder="Dear ones — if you're reading this, I want you to know…"
          className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2.5 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--legacy-muted)]">
          Guidance for later{" "}
          <span className="normal-case tracking-normal">
            (optional)
          </span>
        </span>
        <textarea
          value={generalInstructions}
          onChange={(e) => setGeneralInstructions(e.target.value)}
          rows={4}
          maxLength={20000}
          disabled={busy}
          placeholder="Anything else you'd like them to know — priorities, values, or practical wishes."
          className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2.5 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--legacy-muted)]">
          Memorial or service preferences{" "}
          <span className="normal-case tracking-normal text-[color:var(--legacy-muted)]">
            (optional)
          </span>
        </span>
        <textarea
          value={funeralPreferences}
          onChange={(e) => setFuneralPreferences(e.target.value)}
          rows={3}
          maxLength={20000}
          disabled={busy}
          placeholder="If you'd like to share preferences for a gathering, burial, or celebration of life."
          className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2.5 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
        />
      </label>

      {error ? (
        <p className="text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="text-sm text-[color:var(--legacy-accent-deep)]">
          Saved — your words are stored privately in your vault.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-md bg-[color:var(--legacy-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[color:var(--legacy-accent-deep)] disabled:opacity-50"
      >
        <Save className="size-4" aria-hidden />
        {busy ? "Saving…" : isLetter ? "Save written message" : "Save message"}
      </button>
    </form>
  );
}
