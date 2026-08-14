"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { Loader2, Plus, X } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import type { MediaTagEntry } from "@/lib/media/tags";
import { cn } from "@/lib/utils";

export type MediaTagsPayload = {
  mediaId: string;
  aiTags: string[];
  userTags: string[];
  tags: MediaTagEntry[];
  dismissedAiTags?: string[];
  canEdit: boolean;
};

type MediaTagsEditorProps = {
  mediaId: string;
  className?: string;
  /** Focus the add-tag input after load when editable. */
  autoFocus?: boolean;
  /** Optional external ref for the add-tag input (keyboard flows). */
  inputRef?: RefObject<HTMLInputElement | null>;
  /**
   * Called on keydown inside the editor (e.g. Tab / Esc from parent tag mode).
   * Return true if the event was handled.
   */
  onEditorKeyDown?: (event: KeyboardEvent<HTMLElement>) => boolean;
  /** Fired after a successful load or save with the latest payload. */
  onPayloadChange?: (payload: MediaTagsPayload) => void;
  /** Compact chip/input layout for docks. */
  compact?: boolean;
};

/**
 * Inline AI + user tags editor (load / add / remove). Used by the viewer modal
 * and Photos tag mode dock. AI and user chips both support remove when editable.
 */
export function MediaTagsEditor({
  mediaId,
  className,
  autoFocus = false,
  inputRef: externalInputRef,
  onEditorKeyDown,
  onPayloadChange,
  compact = false,
}: MediaTagsEditorProps) {
  const t = useTranslations();
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<MediaTagsPayload | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? internalInputRef;

  const applyPayload = useCallback(
    (data: MediaTagsPayload) => {
      const next: MediaTagsPayload = {
        mediaId: data.mediaId,
        aiTags: data.aiTags ?? [],
        userTags: data.userTags ?? [],
        tags: data.tags ?? [],
        dismissedAiTags: data.dismissedAiTags ?? [],
        canEdit: Boolean(data.canEdit),
      };
      setPayload(next);
      onPayloadChange?.(next);
    },
    [onPayloadChange],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDraft("");
    try {
      const res = await fetch(`/api/media/${mediaId}/tags`);
      const data = (await res.json().catch(() => ({}))) as MediaTagsPayload & {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || t("mediaUi.tagsLoadError"));
      }
      applyPayload(data);
    } catch (err) {
      setPayload(null);
      setError(
        err instanceof Error ? err.message : t("mediaUi.tagsLoadError"),
      );
    } finally {
      setLoading(false);
    }
  }, [mediaId, t, applyPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoFocus || loading || !payload?.canEdit) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(id);
  }, [autoFocus, loading, payload?.canEdit, mediaId, inputRef]);

  function addTag() {
    if (!payload?.canEdit || pending) return;
    const value = draft.trim();
    if (!value) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/media/${mediaId}/tags`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ add: [value] }),
        });
        const data = (await res.json().catch(() => ({}))) as MediaTagsPayload & {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || t("mediaUi.tagsSaveError"));
        }
        applyPayload(data);
        setDraft("");
        inputRef.current?.focus();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("mediaUi.tagsSaveError"),
        );
      }
    });
  }

  function removeTag(tag: string) {
    if (!payload?.canEdit || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/media/${mediaId}/tags`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ remove: [tag] }),
        });
        const data = (await res.json().catch(() => ({}))) as MediaTagsPayload & {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || t("mediaUi.tagsSaveError"));
        }
        applyPayload(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("mediaUi.tagsSaveError"),
        );
      }
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (onEditorKeyDown?.(event)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
  }

  const aiTags = payload?.tags.filter((tag) => tag.source === "ai") ?? [];
  const userTags = payload?.tags.filter((tag) => tag.source === "user") ?? [];

  return (
    <div className={cn("space-y-3", className)} onKeyDown={handleKeyDown}>
      {loading && !payload ? (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-ink-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t("mediaUi.tagsLoading")}
        </div>
      ) : (
        <>
          <section className="space-y-1.5">
            <h3
              className={cn(
                "font-medium uppercase tracking-wide text-ink-muted",
                compact ? "text-[10px]" : "text-xs",
              )}
            >
              {t("mediaUi.tagsAiSection")}
            </h3>
            {aiTags.length === 0 ? (
              <p className="text-sm text-ink-muted">{t("mediaUi.tagsAiEmpty")}</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {aiTags.map((tag) => (
                  <li key={`ai-${tag.value}`}>
                    <span className="inline-flex items-center gap-1 rounded-md border border-ink/10 bg-canvas-deep px-2 py-1 text-xs text-ink">
                      {tag.value}
                      <span className="text-[10px] uppercase tracking-wide text-ink-muted">
                        {t("mediaUi.tagsAiBadge")}
                      </span>
                      {payload?.canEdit ? (
                        <button
                          type="button"
                          onClick={() => removeTag(tag.value)}
                          disabled={pending}
                          className="rounded p-0.5 text-ink-muted transition hover:bg-ink/5 hover:text-ink disabled:opacity-50"
                          aria-label={t("mediaUi.tagsRemove", {
                            tag: tag.value,
                          })}
                        >
                          <X className="size-3" aria-hidden />
                        </button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-1.5">
            <h3
              className={cn(
                "font-medium uppercase tracking-wide text-ink-muted",
                compact ? "text-[10px]" : "text-xs",
              )}
            >
              {t("mediaUi.tagsYoursSection")}
            </h3>
            {userTags.length === 0 ? (
              <p className="text-sm text-ink-muted">
                {payload?.canEdit
                  ? t("mediaUi.tagsYoursEmptyEditable")
                  : t("mediaUi.tagsYoursEmpty")}
              </p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {userTags.map((tag) => (
                  <li key={`user-${tag.value}`}>
                    <span className="inline-flex items-center gap-1 rounded-md border border-accent/25 bg-accent/10 px-2 py-1 text-xs text-ink">
                      {tag.value}
                      {payload?.canEdit ? (
                        <button
                          type="button"
                          onClick={() => removeTag(tag.value)}
                          disabled={pending}
                          className="rounded p-0.5 text-ink-muted transition hover:bg-ink/5 hover:text-ink disabled:opacity-50"
                          aria-label={t("mediaUi.tagsRemove", {
                            tag: tag.value,
                          })}
                        >
                          <X className="size-3" aria-hidden />
                        </button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {payload?.canEdit ? (
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                addTag();
              }}
            >
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !draft.trim()) {
                    if (onEditorKeyDown?.(event)) {
                      event.preventDefault();
                      event.stopPropagation();
                    }
                    return;
                  }
                  if (event.key === "Enter") return;
                  if (onEditorKeyDown?.(event)) {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                }}
                maxLength={48}
                disabled={pending}
                placeholder={t("mediaUi.tagsInputPlaceholder")}
                className="ui-input min-w-0 flex-1 text-sm"
                autoComplete="off"
                aria-label={t("mediaUi.tagsInputPlaceholder")}
              />
              <button
                type="submit"
                disabled={pending || !draft.trim()}
                className="ui-btn ui-btn-primary ui-btn-sm shrink-0"
              >
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Plus className="size-3.5" aria-hidden />
                )}
                {t("mediaUi.tagsAdd")}
              </button>
            </form>
          ) : payload ? (
            <p className="text-xs text-ink-muted">{t("mediaUi.tagsReadOnlyHint")}</p>
          ) : null}
        </>
      )}

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
