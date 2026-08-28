"use client";

import { useCallback, useState } from "react";
import { BookOpenText, Loader2, RefreshCw } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

export type PersonStoryView = {
  body: string | null;
  sourceCaptionCount: number;
  generatedAt: string | null;
  generatedBy: "system" | "user" | null;
};

type Props = {
  personId: string;
  displayName: string;
  story: PersonStoryView;
  onStoryChange: (story: PersonStoryView) => void;
  className?: string;
};

/**
 * Person detail “Story” — built from captions on photos where they appear.
 */
export function PersonStorySection({
  personId,
  displayName,
  story,
  onStoryChange,
  className,
}: Props) {
  const t = useTranslations();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (pending) return;
    if (story.body) {
      const ok = window.confirm(t("people.storyRefreshConfirm"));
      if (!ok) return;
    }
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/people/${personId}/story`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: true }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        story?: PersonStoryView;
        error?: string;
      };
      if (!res.ok || !data.story) {
        setError(data.error || t("people.storyRefreshError"));
        return;
      }
      onStoryChange(data.story);
    } catch {
      setError(t("people.storyRefreshError"));
    } finally {
      setPending(false);
    }
  }, [onStoryChange, pending, personId, story.body, t]);

  const hasStory = Boolean(story.body?.trim());

  return (
    <section
      className={cn(
        "rounded-2xl border border-ink/8 bg-canvas/60 px-4 py-4 sm:px-5",
        className,
      )}
      aria-labelledby="person-story-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="person-story-heading"
            className="flex items-center gap-2 text-sm font-semibold text-ink"
          >
            <BookOpenText className="size-4 text-accent" aria-hidden />
            {t("people.storyTitle")}
          </h2>
          {hasStory && story.sourceCaptionCount > 0 ? (
            <p className="mt-1 text-xs text-ink-muted">
              {t("people.storyUpdatedFrom", {
                count: String(story.sourceCaptionCount),
              })}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={pending}
          className="ui-btn ui-btn-secondary ui-btn-sm inline-flex items-center gap-1.5"
        >
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-3.5" aria-hidden />
          )}
          {hasStory ? t("people.storyRefresh") : t("people.storyGenerate")}
        </button>
      </div>

      {hasStory ? (
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink whitespace-pre-wrap">
          {story.body}
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">
          {t("people.storyEmpty", { name: displayName })}
        </p>
      )}

      {error ? (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
