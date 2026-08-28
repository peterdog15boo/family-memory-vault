"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import {
  MEDIA_CAPTION_MAX_LENGTH,
  type MediaCaptionPayload,
} from "@/lib/media/captions-shared";
import { cn } from "@/lib/utils";

type Props = {
  mediaId: string;
  /** Caption from library payload (may be stale until reload/save). */
  initialCaption?: string | null;
  /** Called after a successful save so the gallery can update locally. */
  onCaptionChange?: (caption: string | null) => void;
  /** Notify parent so lightbox Esc / arrows defer while editing. */
  onEditingChange?: (editing: boolean) => void;
  className?: string;
  /** Tighter layout under the lightbox image. */
  compact?: boolean;
};

/**
 * Inline caption under a photo/video. Click to edit when allowed;
 * Enter saves, Esc cancels.
 */
export function MediaCaptionEditor({
  mediaId,
  initialCaption = null,
  onCaptionChange,
  onEditingChange,
  className,
  compact = false,
}: Props) {
  const t = useTranslations();
  const inputId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [caption, setCaption] = useState<string | null>(initialCaption);
  const [draft, setDraft] = useState(initialCaption ?? "");
  const [editing, setEditing] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [editedByName, setEditedByName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setCaption(initialCaption);
    setDraft(initialCaption ?? "");
    setEditing(false);
    setError(null);
    setLoaded(false);
  }, [mediaId, initialCaption]);

  useEffect(() => {
    onEditingChange?.(editing);
    return () => onEditingChange?.(false);
  }, [editing, onEditingChange]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/media/${mediaId}/caption`);
        if (!res.ok) {
          if (!cancelled) {
            setCanEdit(false);
            setLoaded(true);
          }
          return;
        }
        const data = (await res.json()) as MediaCaptionPayload;
        if (cancelled) return;
        setCaption(data.caption);
        setDraft(data.caption ?? "");
        setCanEdit(data.canEdit);
        setEditedByName(data.captionUpdatedByName);
        setLoaded(true);
      } catch {
        if (!cancelled) {
          setCanEdit(false);
          setLoaded(true);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const len = el.value.length;
    try {
      el.setSelectionRange(len, len);
    } catch {
      /* ignore */
    }
  }, [editing]);

  const startEdit = useCallback(() => {
    if (!canEdit || !loaded) return;
    setDraft(caption ?? "");
    setError(null);
    setEditing(true);
  }, [canEdit, loaded, caption]);

  const cancel = useCallback(() => {
    setDraft(caption ?? "");
    setError(null);
    setEditing(false);
  }, [caption]);

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/media/${mediaId}/caption`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption: draft }),
      });
      const data = (await res.json().catch(() => ({}))) as MediaCaptionPayload & {
        error?: string;
      };
      if (!res.ok) {
        setError(data.error || t("mediaUi.captionSaveError"));
        return;
      }
      setCaption(data.caption);
      setDraft(data.caption ?? "");
      setEditedByName(data.captionUpdatedByName);
      setCanEdit(data.canEdit);
      setEditing(false);
      onCaptionChange?.(data.caption);
    } catch {
      setError(t("mediaUi.captionSaveError"));
    } finally {
      setSaving(false);
    }
  }, [draft, mediaId, onCaptionChange, saving, t]);

  function onKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      void save();
    }
  }

  const showEditedBy =
    Boolean(caption) &&
    Boolean(editedByName) &&
    !editing;

  return (
    <div className={cn("min-w-0", className)}>
      {editing ? (
        <div className="space-y-2">
          <label htmlFor={inputId} className="sr-only">
            {t("mediaUi.captionAdd")}
          </label>
          <textarea
            ref={textareaRef}
            id={inputId}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MEDIA_CAPTION_MAX_LENGTH))}
            onKeyDown={onKeyDown}
            rows={compact ? 2 : 3}
            maxLength={MEDIA_CAPTION_MAX_LENGTH}
            disabled={saving}
            placeholder={t("mediaUi.captionPlaceholder")}
            className={cn(
              "ui-input w-full resize-none text-sm leading-snug",
              "min-h-[2.75rem]",
            )}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-ink-muted">
              {t("mediaUi.captionCharCount", {
                count: String(draft.length),
                max: String(MEDIA_CAPTION_MAX_LENGTH),
              })}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="ui-btn ui-btn-ghost ui-btn-sm"
                disabled={saving}
                onClick={cancel}
              >
                {t("mediaUi.captionCancel")}
              </button>
              <button
                type="button"
                className="ui-btn ui-btn-primary ui-btn-sm"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? t("mediaUi.captionSaving") : t("mediaUi.captionSave")}
              </button>
            </div>
          </div>
          {error ? (
            <p className="text-xs text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={startEdit}
          disabled={!canEdit || !loaded}
          className={cn(
            "w-full rounded-md px-1 py-0.5 text-left text-sm leading-snug transition",
            canEdit && loaded
              ? "hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              : "cursor-default",
            !caption && "text-ink-muted",
            caption && "text-ink",
          )}
        >
          {caption ? (
            <span className="whitespace-pre-wrap break-words">{caption}</span>
          ) : canEdit && loaded ? (
            <span>{t("mediaUi.captionAdd")}</span>
          ) : (
            <span className="sr-only">{t("mediaUi.captionAdd")}</span>
          )}
        </button>
      )}
      {showEditedBy ? (
        <p className="mt-0.5 px-1 text-[11px] text-ink-muted">
          {t("mediaUi.captionEditedBy", { name: editedByName! })}
        </p>
      ) : null}
    </div>
  );
}
