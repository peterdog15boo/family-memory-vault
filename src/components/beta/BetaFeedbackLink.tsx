"use client";

import { MessageCircleHeart } from "lucide-react";
import { getBetaSurveyUrl } from "@/lib/beta-survey";
import { cn } from "@/lib/utils";

type BetaFeedbackLinkProps = {
  className?: string;
  /** Compact icon-only on very small screens when true (default). */
  collapseLabel?: boolean;
};

/**
 * Header/nav entry point for the temporary beta survey.
 * Renders nothing when NEXT_PUBLIC_BETA_SURVEY_URL is unset.
 */
export function BetaFeedbackLink({
  className,
  collapseLabel = true,
}: BetaFeedbackLinkProps) {
  const surveyUrl = getBetaSurveyUrl();
  if (!surveyUrl) return null;

  return (
    <a
      href={surveyUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "dashboard-icon-btn inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-canvas px-2.5 py-2 text-ink-muted transition-colors hover:border-accent/30 hover:text-accent-deep sm:px-3",
        className,
      )}
      aria-label="Give feedback (opens survey in a new tab)"
    >
      <MessageCircleHeart className="size-4 shrink-0" aria-hidden />
      <span
        className={cn(
          "text-xs font-medium",
          collapseLabel ? "hidden sm:inline" : "inline",
        )}
      >
        Feedback
      </span>
    </a>
  );
}
