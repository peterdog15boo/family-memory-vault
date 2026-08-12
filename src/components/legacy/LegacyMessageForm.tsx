"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
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
  const t = useTranslations();
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
      if (!res.ok) throw new Error(data.error || t("legacy.errorSaveMessage"));
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("legacy.errorSaveMessage"),
      );
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
        <h2 className="font-display text-xl tracking-tight text-[color:var(--legacy-ink)]">
          {isLetter ? t("legacy.writeToThem") : t("legacy.navMessage")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--legacy-muted)]">
          {isLetter ? t("legacy.messageLeadLetter") : t("legacy.messageLead")}
        </p>
      </div>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--legacy-muted)]">
          {isLetter ? t("legacy.yourLetter") : t("legacy.yourMessage")}
        </span>
        <textarea
          value={summaryMessage}
          onChange={(e) => setSummaryMessage(e.target.value)}
          rows={isLetter ? 8 : 10}
          maxLength={20000}
          disabled={busy}
          placeholder={t("legacy.messagePlaceholder")}
          className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2.5 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--legacy-muted)]">
          {t("legacy.guidanceLabel")}{" "}
          <span className="normal-case tracking-normal">
            ({t("common.optional")})
          </span>
        </span>
        <textarea
          value={generalInstructions}
          onChange={(e) => setGeneralInstructions(e.target.value)}
          rows={4}
          maxLength={20000}
          disabled={busy}
          placeholder={t("legacy.guidancePlaceholder")}
          className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2.5 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--legacy-muted)]">
          {t("legacy.memorialLabel")}{" "}
          <span className="normal-case tracking-normal text-[color:var(--legacy-muted)]">
            ({t("common.optional")})
          </span>
        </span>
        <textarea
          value={funeralPreferences}
          onChange={(e) => setFuneralPreferences(e.target.value)}
          rows={3}
          maxLength={20000}
          disabled={busy}
          placeholder={t("legacy.memorialPlaceholder")}
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
          {t("legacy.messageSaved")}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-md bg-[color:var(--legacy-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[color:var(--legacy-accent-deep)] disabled:opacity-50"
      >
        <Save className="size-4" aria-hidden />
        {busy
          ? t("common.saving")
          : isLetter
            ? t("legacy.saveWrittenMessage")
            : t("legacy.saveMessage")}
      </button>
    </form>
  );
}
