"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Tags, X } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { MediaTagsEditor } from "@/components/media/MediaTagsEditor";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import { resolveTagPhotoNavigation } from "@/lib/media/tag-keyboard";
import { cn } from "@/lib/utils";

type MediaTagsControlProps = {
  mediaId: string;
  className?: string;
  /** Compact trigger for tight footers. */
  compact?: boolean;
  /** Cycle to previous media while the tag editor is open. */
  onPrev?: () => void;
  /** Cycle to next media while the tag editor is open. */
  onNext?: () => void;
  canNavigate?: boolean;
  /** Notify parent so lightbox arrow keys can defer to the tag editor. */
  onOpenChange?: (open: boolean) => void;
};

/**
 * Tags button + editor for the photo/video viewer.
 * Shows AI + user tags; owners/contributors can add/remove user tags (saved immediately).
 */
export function MediaTagsControl({
  mediaId,
  className,
  compact = false,
  onPrev,
  onNext,
  canNavigate = false,
  onOpenChange,
}: MediaTagsControlProps) {
  const t = useTranslations();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [canEdit, setCanEdit] = useState<boolean | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Stay open across photo navigation so keyboard tagging can continue.
  useEffect(() => {
    setCanEdit(null);
  }, [mediaId]);

  useEffect(() => {
    onOpenChange?.(open);
    return () => onOpenChange?.(false);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open || !canNavigate) return;

    function onWindowKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey) return;

      const direction = resolveTagPhotoNavigation(event, "viewer");
      if (!direction) return;

      event.preventDefault();
      if (direction === "prev") onPrev?.();
      else onNext?.();
    }

    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [open, canNavigate, onPrev, onNext]);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus({ preventScroll: true });
      try {
        const len = input.value.length;
        input.setSelectionRange(len, len);
      } catch {
        /* ignore */
      }
    }, 50);
    return () => window.clearTimeout(id);
  }, [open, mediaId]);

  useOverlayA11y({
    open,
    onClose: () => setOpen(false),
    containerRef: panelRef,
  });

  const panel =
    open && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[110] flex items-end justify-center bg-ink/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
            onClick={() => setOpen(false)}
          >
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className={cn(
                "flex max-h-[min(85vh,100%)] w-full max-w-lg flex-col overflow-hidden",
                "rounded-t-2xl border border-ink/10 bg-canvas shadow-2xl sm:rounded-xl",
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 border-b border-ink/8 px-4 py-3">
                <div className="min-w-0">
                  <h2
                    id={titleId}
                    className="flex items-center gap-2 text-sm font-semibold text-ink"
                  >
                    <Tags className="size-4 text-accent" aria-hidden />
                    {t("mediaUi.tagsTitle")}
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {canEdit === false
                      ? t("mediaUi.tagsReadOnlyHint")
                      : t("mediaUi.tagsEditableHint")}
                  </p>
                  {canNavigate ? (
                    <p className="mt-0.5 hidden text-[11px] text-ink-muted sm:block">
                      {t("mediaUi.tagsViewerNavHint")}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="ui-btn ui-btn-ghost ui-btn-sm shrink-0"
                  aria-label={t("common.close")}
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <MediaTagsEditor
                  key={mediaId}
                  mediaId={mediaId}
                  autoFocus
                  inputRef={inputRef}
                  onPayloadChange={(payload) => setCanEdit(payload.canEdit)}
                />
              </div>

              {canNavigate ? (
                <div className="flex flex-col gap-2 border-t border-ink/8 px-4 py-3">
                  <p className="text-center text-[11px] text-ink-muted sm:hidden">
                    {t("mediaUi.tagsViewerMobileHint")}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onPrev?.()}
                      className="ui-btn ui-btn-secondary ui-btn-sm inline-flex flex-1 items-center justify-center gap-1"
                    >
                      <ChevronLeft className="size-4" aria-hidden />
                      {t("common.previous")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onNext?.()}
                      className="ui-btn ui-btn-secondary ui-btn-sm inline-flex flex-1 items-center justify-center gap-1"
                    >
                      {t("common.next")}
                      <ChevronRight className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={cn(className)}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "ui-btn ui-btn-secondary inline-flex items-center justify-center gap-1.5",
          compact ? "ui-btn-sm w-full sm:w-auto" : "w-full sm:w-auto",
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Tags className="size-3.5" aria-hidden />
        {t("mediaUi.tagsButton")}
      </button>
      {panel}
    </div>
  );
}
