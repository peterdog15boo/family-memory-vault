"use client";

import { useEffect, useState } from "react";
import { ClipboardList, ExternalLink, MessageCircleHeart, X } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import {
  BETA_SURVEY_DISMISS_KEY,
  getBetaSurveyUrl,
} from "@/lib/beta-survey";
import { isBetaFeedbackEnabled } from "@/lib/feedback/flags";
import { openFeedback } from "@/lib/feedback/open";

/**
 * Soft, dismissible beta feedback prompt for the Dashboard.
 * Opens the in-app feedback modal and optionally links to the longer survey.
 */
export function BetaSurveyBanner() {
  const t = useTranslations();
  const [visible, setVisible] = useState(false);
  const enabled = isBetaFeedbackEnabled();
  const surveyUrl = getBetaSurveyUrl();

  useEffect(() => {
    if (!enabled) return;
    try {
      if (window.localStorage.getItem(BETA_SURVEY_DISMISS_KEY) === "1") {
        return;
      }
    } catch {
      // private mode / blocked storage — still show once this session
    }
    setVisible(true);
  }, [enabled]);

  if (!enabled || !visible) return null;

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(BETA_SURVEY_DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  }

  return (
    <aside
      className="app-banner flex flex-col gap-3 rounded-xl border border-accent/20 bg-accent/5 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      aria-label={t("feedback.bannerAria")}
    >
      <div className="flex min-w-0 items-start gap-3">
        <MessageCircleHeart
          className="mt-0.5 size-4 shrink-0 text-accent-deep"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">
            {t("feedback.bannerTitle")}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
            {surveyUrl
              ? t("feedback.bannerBodyWithSurvey")
              : t("feedback.bannerBody")}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-md p-1.5 text-ink-muted transition hover:bg-ink/5 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:hidden"
          aria-label={t("feedback.dismissAria")}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-7 sm:pl-0">
        <button
          type="button"
          onClick={() => openFeedback()}
          className="ui-btn ui-btn-secondary ui-btn-sm inline-flex flex-1 justify-center sm:flex-none"
        >
          {t("feedback.bannerCta")}
        </button>
        {surveyUrl ? (
          <a
            href={surveyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ui-btn ui-btn-ghost ui-btn-sm inline-flex flex-1 items-center justify-center gap-1.5 sm:flex-none"
          >
            <ClipboardList className="size-3.5" aria-hidden />
            {t("feedback.surveyCta")}
            <ExternalLink className="size-3 opacity-70" aria-hidden />
            <span className="sr-only">{t("feedback.surveyOpensNew")}</span>
          </a>
        ) : null}
        <button
          type="button"
          onClick={dismiss}
          className="hidden rounded-md p-1.5 text-ink-muted transition hover:bg-ink/5 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:inline-flex"
          aria-label={t("feedback.dismissAria")}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </aside>
  );
}
