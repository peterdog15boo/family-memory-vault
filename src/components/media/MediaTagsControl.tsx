"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Tags, X } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { MediaTagsEditor } from "@/components/media/MediaTagsEditor";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import { cn } from "@/lib/utils";

type MediaTagsControlProps = {
  mediaId: string;
  className?: string;
  /** Compact trigger for tight footers. */
  compact?: boolean;
};

/**
 * Tags button + editor for the photo/video viewer.
 * Shows AI + user tags; owners/contributors can add/remove user tags (saved immediately).
 */
export function MediaTagsControl({
  mediaId,
  className,
  compact = false,
}: MediaTagsControlProps) {
  const t = useTranslations();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [canEdit, setCanEdit] = useState<boolean | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setOpen(false);
    setCanEdit(null);
  }, [mediaId]);

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
                  mediaId={mediaId}
                  autoFocus
                  onPayloadChange={(payload) => setCanEdit(payload.canEdit)}
                />
              </div>
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
