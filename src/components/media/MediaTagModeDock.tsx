"use client";

import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Tags,
  X,
} from "lucide-react";
import { MediaThumb } from "@/components/memories/MediaThumb";
import { MediaTagsEditor } from "@/components/media/MediaTagsEditor";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import type { SerializedSafeMedia } from "@/lib/memories/types";
import { cn } from "@/lib/utils";

type MediaTagModeDockProps = {
  active: SerializedSafeMedia;
  index: number;
  count: number;
  onPrev: () => void;
  onNext: () => void;
  onExit: () => void;
};

/**
 * Sticky bottom dock for Photos tag mode — edit keywords without opening the viewer.
 */
export function MediaTagModeDock({
  active,
  index,
  count,
  onPrev,
  onNext,
  onExit,
}: MediaTagModeDockProps) {
  const t = useTranslations();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const canNav = count > 1;
  const label =
    active.originalFilename ||
    (active.type === "video" ? t("mediaUi.familyMedia") : t("mediaUi.familyMedia"));

  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(id);
  }, [active.id]);

  function handleEditorKeyDown(event: KeyboardEvent<HTMLElement>): boolean {
    // Empty Enter → next photo (rapid batch flow). Tab/Esc handled on window.
    if (
      event.key === "Enter" &&
      event.target instanceof HTMLInputElement &&
      !event.target.value.trim()
    ) {
      onNext();
      return true;
    }
    return false;
  }

  useEffect(() => {
    function onWindowKeyDown(event: globalThis.KeyboardEvent) {
      if (event.altKey || event.metaKey || event.ctrlKey) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onExit();
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        if (event.shiftKey) onPrev();
        else onNext();
      }
    }
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [onExit, onPrev, onNext]);

  return createPortal(
    <div
      ref={dockRef}
      role="region"
      aria-labelledby={titleId}
      className={cn(
        "fixed inset-x-0 bottom-0 z-[90]",
        "border-t border-ink/10 bg-canvas/95 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] backdrop-blur-md",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
      )}
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative size-12 shrink-0 overflow-hidden rounded-md border border-ink/10 bg-canvas-deep sm:size-14">
              {active.previewUrl &&
              (active.type === "photo" || active.hasThumbnail) ? (
                <MediaThumb item={active} alt={label} />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] text-ink-muted">
                  {active.type === "video" ? "Video" : "Photo"}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <h2
                id={titleId}
                className="flex items-center gap-1.5 text-sm font-semibold text-ink"
              >
                <Tags className="size-3.5 text-accent" aria-hidden />
                {t("mediaUi.tagModeTitle")}
              </h2>
              <p className="truncate text-xs text-ink-muted">
                {label}
                <span className="text-ink/40"> · </span>
                <span aria-live="polite">
                  {t("mediaUi.tagModePosition", {
                    index: index + 1,
                    count,
                  })}
                </span>
              </p>
              <p className="mt-0.5 hidden text-[11px] text-ink-muted sm:block">
                {t("mediaUi.tagModeHint")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="ui-btn ui-btn-ghost ui-btn-sm shrink-0"
            aria-label={t("mediaUi.tagModeExit")}
          >
            <X className="size-4" aria-hidden />
            <span className="hidden sm:inline">{t("common.done")}</span>
          </button>
        </div>

        <MediaTagsEditor
          key={active.id}
          mediaId={active.id}
          autoFocus
          compact
          inputRef={inputRef}
          onEditorKeyDown={handleEditorKeyDown}
        />

        <div className="flex flex-col gap-2">
          <p className="text-center text-[11px] text-ink-muted sm:hidden">
            {t("mediaUi.tagModeMobileHint")}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onPrev}
              disabled={!canNav}
              className="ui-btn ui-btn-secondary ui-btn-sm inline-flex flex-1 items-center justify-center gap-1"
            >
              <ChevronLeft className="size-4" aria-hidden />
              {t("common.previous")}
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!canNav}
              className="ui-btn ui-btn-secondary ui-btn-sm inline-flex flex-1 items-center justify-center gap-1"
            >
              {t("common.next")}
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
