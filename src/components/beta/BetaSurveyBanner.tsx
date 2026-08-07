"use client";

import { useEffect, useState } from "react";
import { MessageCircleHeart, X } from "lucide-react";
import {
  BETA_SURVEY_DISMISS_KEY,
  getBetaSurveyUrl,
} from "@/lib/beta-survey";

/**
 * Soft, dismissible beta survey prompt for the Dashboard.
 * Remembers dismissal in localStorage. Hidden when survey URL is unset.
 */
export function BetaSurveyBanner() {
  const surveyUrl = getBetaSurveyUrl();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!surveyUrl) return;
    try {
      if (window.localStorage.getItem(BETA_SURVEY_DISMISS_KEY) === "1") {
        return;
      }
    } catch {
      // private mode / blocked storage — still show once this session
    }
    setVisible(true);
  }, [surveyUrl]);

  if (!surveyUrl || !visible) return null;

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
      aria-label="Beta feedback"
    >
      <div className="flex min-w-0 items-start gap-3">
        <MessageCircleHeart
          className="mt-0.5 size-4 shrink-0 text-accent-deep"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">
            Enjoying the beta? Tell us what you think.
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
            A short survey helps us make Family Memory Vault kinder for families
            like yours. Thank you.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-md p-1.5 text-ink-muted transition hover:bg-ink/5 hover:text-ink sm:hidden"
          aria-label="Dismiss feedback banner"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2 pl-7 sm:pl-0">
        <a
          href={surveyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ui-btn ui-btn-secondary ui-btn-sm inline-flex flex-1 justify-center sm:flex-none"
        >
          Take the survey
        </a>
        <button
          type="button"
          onClick={dismiss}
          className="hidden rounded-md p-1.5 text-ink-muted transition hover:bg-ink/5 hover:text-ink sm:inline-flex"
          aria-label="Dismiss feedback banner"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </aside>
  );
}
