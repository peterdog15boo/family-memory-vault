"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Ava } from "@/components/ava/Ava";
import { useTranslations, useLocale } from "@/components/i18n/LocaleProvider";
import type { AvaProgress } from "@/lib/ava/types";
import { cn } from "@/lib/utils";

/**
 * Settings: show/hide Ava helper tips (maps to helperEnabled).
 */
export function AvaSettingsCard() {
  const t = useTranslations();
  const { locale } = useLocale();
  const [progress, setProgress] = useState<AvaProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void fetch("/api/ava")
      .then((r) => r.json())
      .then((data: { progress?: AvaProgress }) => {
        if (data.progress) setProgress(data.progress);
      })
      .catch(() => undefined);
  }, [locale]);

  if (!progress?.eligible) return null;

  const tipsOn = progress.helperEnabled;

  function setTipsEnabled(enabled: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/ava", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: enabled ? "resume" : "disable",
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          progress?: AvaProgress;
        };
        if (!res.ok || !data.progress) {
          throw new Error(data.error || t("ava.couldNotUpdate"));
        }
        setProgress(data.progress);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("ava.updateFailed"),
        );
      }
    });
  }

  return (
    <section className="rounded-2xl border border-ink/10 bg-canvas px-5 py-5">
      <div className="flex items-start gap-3">
        <Ava size="md" decorative className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl text-ink">
            {t("ava.settings.title")}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            {t("ava.settings.description")}
          </p>

          <label
            className={cn(
              "mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-ink/10 bg-canvas-deep/40 px-4 py-3",
              "focus-within:ring-2 focus-within:ring-accent/40",
              pending && "opacity-70",
            )}
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">
                {t("ava.settings.showTips")}
              </span>
              <span className="mt-0.5 block text-xs text-ink-muted">
                {tipsOn
                  ? t("ava.settings.tipsOn")
                  : t("ava.settings.tipsOff")}
              </span>
            </span>
            <span className="flex items-center gap-2">
              {pending ? (
                <Loader2
                  className="size-4 animate-spin text-ink-muted"
                  aria-hidden
                />
              ) : null}
              <input
                type="checkbox"
                className="peer sr-only"
                checked={tipsOn}
                disabled={pending}
                onChange={(e) => setTipsEnabled(e.target.checked)}
                aria-label={t("ava.settings.showTips")}
              />
              <span
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                  tipsOn ? "bg-accent" : "bg-ink/20",
                )}
                aria-hidden
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 size-5 rounded-full bg-canvas shadow transition-transform",
                    tipsOn && "translate-x-5",
                  )}
                />
              </span>
            </span>
          </label>

          <p className="mt-3 text-xs text-ink-muted">
            {progress.completed
              ? t("ava.settings.statusCompleted")
              : progress.dismissed
                ? t("ava.settings.statusPaused")
                : tipsOn
                  ? t("ava.settings.statusReady")
                  : t("ava.settings.statusOff")}
            {" · "}
            {t("ava.settings.percentTouched", { percent: progress.percent })}
          </p>

          {error ? (
            <p className="mt-2 text-xs text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
