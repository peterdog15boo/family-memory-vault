"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Clapperboard, Images, Loader2, X } from "lucide-react";
import { MediaThumb } from "@/components/memories/MediaThumb";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import type { SerializedMemoryListItem } from "@/lib/memories/types";
import { cn } from "@/lib/utils";

/** Matches CreateMoviePanel / movie generator — at least one clean+ready item. */
export const MIN_MOVIE_MEMORY_MEDIA = 1;

type MakeMovieFromLibraryButtonProps = {
  /** Owned memories from the library (caller should pass own albums only). */
  memories: SerializedMemoryListItem[];
  /** Open the picker on mount (e.g. `/memories?createMovie=1`). */
  autoOpen?: boolean;
  className?: string;
};

/**
 * Memories list CTA: pick which album to turn into a movie (no silent default).
 * Continues to the memory detail create panel with Simple Mode (`?createMovie=1`).
 */
export function MakeMovieFromLibraryButton({
  memories,
  autoOpen = false,
  className,
}: MakeMovieFromLibraryButtonProps) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const eligible = useMemo(
    () =>
      memories.filter((m) => m.mediaCount >= MIN_MOVIE_MEMORY_MEDIA),
    [memories],
  );

  const close = useCallback(() => {
    if (navigatingId) return;
    setOpen(false);
    setLocalError(null);
  }, [navigatingId]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  useEffect(() => {
    if (!autoOpen || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("createMovie") !== "1") return;
    url.searchParams.delete("createMovie");
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(null, "", next);
  }, [autoOpen]);

  useOverlayA11y({
    open,
    onClose: close,
    containerRef: dialogRef,
    escapeEnabled: !navigatingId,
  });

  function handleTriggerClick() {
    setLocalError(null);
    if (memories.length === 0) {
      router.push("/memories/new?intent=movie");
      return;
    }
    setOpen(true);
  }

  function selectMemory(memory: SerializedMemoryListItem) {
    setLocalError(null);
    if (memory.mediaCount < MIN_MOVIE_MEMORY_MEDIA) {
      setLocalError(t("memories.makeMovieNeedMedia"));
      return;
    }
    setNavigatingId(memory.id);
    router.push(`/memories/${memory.id}?createMovie=1`);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleTriggerClick}
        className={cn("ui-btn ui-btn-secondary ui-btn-lg", className)}
      >
        <Clapperboard className="size-4" aria-hidden />
        {t("pages.moviesMake")}
      </button>

      {mounted && open
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/45 p-0 sm:items-center sm:p-6"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) close();
              }}
            >
              <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="make-movie-pick-title"
                tabIndex={-1}
                className="flex max-h-[min(88vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-ink/10 bg-canvas shadow-xl sm:rounded-2xl"
              >
                <div className="flex items-start justify-between gap-3 border-b border-ink/8 px-4 py-4 sm:px-5">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                      {t("pages.moviesMake")}
                    </p>
                    <h2
                      id="make-movie-pick-title"
                      className="mt-0.5 font-display text-xl text-ink"
                    >
                      {t("memories.makeMoviePickTitle")}
                    </h2>
                    <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                      {t("memories.makeMoviePickDescription")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={close}
                    disabled={Boolean(navigatingId)}
                    className="rounded-md p-2 text-ink-muted transition hover:bg-ink/5 hover:text-ink disabled:opacity-50"
                    aria-label={t("common.close")}
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>

                {localError ? (
                  <p
                    className="mx-4 mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 sm:mx-5"
                    role="alert"
                  >
                    {localError}
                  </p>
                ) : null}

                <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-3">
                  {eligible.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                      <Images className="size-8 text-ink/25" aria-hidden />
                      <p className="text-sm leading-relaxed text-ink-muted">
                        {t("memories.makeMovieNoEligible")}
                      </p>
                      <a
                        href="/memories/new?intent=movie"
                        className="ui-btn ui-btn-primary ui-btn-sm"
                      >
                        {t("pages.createMemory")}
                      </a>
                    </div>
                  ) : (
                    <ul className="space-y-1" role="listbox" aria-label={t("memories.makeMoviePickTitle")}>
                      {eligible.map((memory) => {
                        const busy = navigatingId === memory.id;
                        return (
                          <li key={memory.id}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={busy}
                              disabled={Boolean(navigatingId)}
                              onClick={() => selectMemory(memory)}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition",
                                "hover:bg-canvas-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                                "disabled:cursor-wait disabled:opacity-70",
                                busy && "bg-canvas-deep",
                              )}
                            >
                              <div className="relative size-14 shrink-0 overflow-hidden rounded-lg border border-ink/10 bg-canvas-deep">
                                {memory.cover ? (
                                  <MediaThumb item={memory.cover} />
                                ) : (
                                  <div className="flex h-full items-center justify-center">
                                    <Images
                                      className="size-5 text-ink/25"
                                      aria-hidden
                                    />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium text-ink">
                                  {memory.title}
                                </p>
                                <p className="mt-0.5 text-xs text-ink-muted">
                                  {t("memories.makeMovieMediaCount", {
                                    count: memory.mediaCount,
                                  })}
                                </p>
                              </div>
                              {busy ? (
                                <Loader2
                                  className="size-4 shrink-0 animate-spin text-accent"
                                  aria-hidden
                                />
                              ) : (
                                <Clapperboard
                                  className="size-4 shrink-0 text-ink/30"
                                  aria-hidden
                                />
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
