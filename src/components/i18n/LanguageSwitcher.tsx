"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Languages, Loader2 } from "lucide-react";
import { useLocale } from "@/components/i18n/LocaleProvider";
import {
  APP_LOCALE_LABELS,
  APP_LOCALES,
  type AppLocale,
} from "@/lib/i18n";
import { cn } from "@/lib/utils";

type LanguageSwitcherProps = {
  className?: string;
  /** Compact select for nav / account chrome. */
  compact?: boolean;
  /** Dark cinematic auth chrome. */
  tone?: "default" | "onDark";
};

/**
 * Language picker — native names, en-US first, instant client update + persist.
 */
export function LanguageSwitcher({
  className,
  compact = false,
  tone = "default",
}: LanguageSwitcherProps) {
  const router = useRouter();
  const { locale, setLocale, t, ready } = useLocale();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: AppLocale) {
    if (next === locale) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await setLocale(next);
      setSaved(true);
      // Soft refresh so server-rendered copy catches up without a hard reload.
      router.refresh();
      window.setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("language.error"));
    } finally {
      setSaving(false);
    }
  }

  const onDark = tone === "onDark";
  const selectClass = cn(
    "ui-input w-full min-w-0 appearance-none py-2 text-sm leading-normal",
    compact ? "min-h-9 max-w-[10.5rem] py-1.5 pl-2 pr-7" : "mt-1.5 min-h-11 max-w-sm",
    onDark &&
      "border-white/25 bg-black/35 text-white shadow-none focus:border-white/45 focus:ring-white/20",
  );

  const options = APP_LOCALES.map((code) => (
    <option key={code} value={code}>
      {APP_LOCALE_LABELS[code]}
    </option>
  ));

  if (compact) {
    return (
      <label
        className={cn(
          "language-switcher-compact inline-flex max-w-full items-center gap-1.5",
          className,
        )}
      >
        <span className="sr-only">{t("language.aria")}</span>
        <Languages
          className={cn(
            "size-3.5 shrink-0",
            onDark ? "text-white/75" : "text-ink-muted",
          )}
          aria-hidden
        />
        <span className="relative min-w-0">
          <select
            value={locale}
            disabled={!ready || saving}
            onChange={(event) => void onChange(event.target.value as AppLocale)}
            className={selectClass}
            aria-label={t("language.aria")}
          >
            {options}
          </select>
          {saving ? (
            <Loader2
              className={cn(
                "pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 animate-spin",
                onDark ? "text-white/70" : "text-ink-muted",
              )}
              aria-hidden
            />
          ) : null}
        </span>
      </label>
    );
  }

  return (
    <section
      id="language"
      className={cn("ui-card ui-card-elevated ui-card-pad-lg", className)}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent-deep)]">
          <Languages className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl tracking-tight text-ink">
            {t("language.title")}
          </h2>
          <p className="page-lead mt-2 text-sm leading-relaxed text-ink-muted">
            {t("language.description")}
          </p>
        </div>
        {saving ? (
          <Loader2 className="size-4 animate-spin text-ink-muted" aria-hidden />
        ) : saved ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--accent-deep)]">
            <Check className="size-3.5" aria-hidden />
            {t("language.saved")}
          </span>
        ) : null}
      </div>

      <label className="mt-5 block">
        <span className="ui-label">{t("language.label")}</span>
        <select
          value={locale}
          disabled={!ready || saving}
          onChange={(event) => void onChange(event.target.value as AppLocale)}
          className={selectClass}
          aria-label={t("language.aria")}
        >
          {options}
        </select>
      </label>

      <p className="mt-3 text-sm text-ink-muted">
        {t("language.current")}:{" "}
        <span className="font-medium text-ink">{APP_LOCALE_LABELS[locale]}</span>
      </p>
      {error ? (
        <p className="mt-3 rounded-lg border border-red-800/15 bg-red-50 px-3 py-2 text-sm text-red-900">
          {error}
        </p>
      ) : null}
    </section>
  );
}
