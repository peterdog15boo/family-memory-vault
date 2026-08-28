"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  MEDIA_COMMENT_MAX_LENGTH,
  type MediaCommentThreadPayload,
  type MediaThreadEntry,
} from "@/lib/media/comments-shared";
import { MEDIA_CAPTION_MAX_LENGTH } from "@/lib/media/captions-shared";
import { cn } from "@/lib/utils";

type Props = {
  mediaId: string;
  /** Initial caption from library payload (shown until thread loads). */
  initialCaption?: string | null;
  onCaptionChange?: (caption: string | null) => void;
  /** True while composing or editing so lightbox Esc/arrows defer. */
  onEditingChange?: (editing: boolean) => void;
  className?: string;
};

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

/**
 * Family-only mini feed under a photo: caption first, then comments, then composer.
 * Always rendered below the image (never beside / overlapping).
 */
export function MediaCommentThread({
  mediaId,
  initialCaption = null,
  onCaptionChange,
  onEditingChange,
  className,
}: Props) {
  const composerId = useId();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [entries, setEntries] = useState<MediaThreadEntry[]>(() =>
    initialCaption?.trim()
      ? [
          {
            id: "caption",
            kind: "caption",
            body: initialCaption.trim(),
            authorUserId: null,
            authorName: null,
            createdAt: null,
            editedAt: null,
            canEdit: false,
            canDelete: false,
          },
        ]
      : [],
  );
  const [canComment, setCanComment] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const composing = draft.trim().length > 0 || editingId != null;

  useEffect(() => {
    onEditingChange?.(composing);
    return () => onEditingChange?.(false);
  }, [composing, onEditingChange]);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError(null);
    setDraft("");
    setEditingId(null);

    async function load() {
      try {
        const res = await fetch(`/api/media/${mediaId}/comments`);
        if (!res.ok) {
          if (!cancelled) {
            setCanComment(false);
            setLoaded(true);
          }
          return;
        }
        const data = (await res.json()) as MediaCommentThreadPayload;
        if (cancelled) return;
        setEntries(data.entries);
        setCanComment(data.canComment);
        setLoaded(true);
        const caption = data.entries.find((e) => e.kind === "caption");
        onCaptionChange?.(caption?.body ?? null);
      } catch {
        if (!cancelled) {
          setCanComment(false);
          setLoaded(true);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // Intentionally omit onCaptionChange — parent setter is stable enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaId]);

  const post = useCallback(async () => {
    const body = draft.trim();
    if (!body || posting || !canComment) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/media/${mediaId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        entry?: MediaThreadEntry;
        error?: string;
      };
      if (!res.ok || !data.entry) {
        setError(data.error || "Couldn’t post.");
        return;
      }
      setEntries((prev) => [...prev, data.entry!]);
      setDraft("");
    } catch {
      setError("Couldn’t post.");
    } finally {
      setPosting(false);
    }
  }, [canComment, draft, mediaId, posting]);

  const saveEdit = useCallback(async () => {
    if (!editingId || savingEdit) return;
    const body = editDraft.trim();
    if (!body) {
      setError("Comment cannot be empty.");
      return;
    }
    setSavingEdit(true);
    setError(null);
    try {
      if (editingId === "caption") {
        const res = await fetch(`/api/media/${mediaId}/caption`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caption: body }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          caption?: string | null;
          captionUpdatedByName?: string | null;
          captionUpdatedAt?: string | null;
          error?: string;
        };
        if (!res.ok) {
          setError(data.error || "Couldn’t save.");
          return;
        }
        const nextCaption = data.caption?.trim() || null;
        onCaptionChange?.(nextCaption);
        setEntries((prev) => {
          if (!nextCaption) {
            return prev.filter((e) => e.id !== "caption");
          }
          return prev.map((e) =>
            e.id === "caption"
              ? {
                  ...e,
                  body: nextCaption,
                  authorName: data.captionUpdatedByName ?? e.authorName,
                  createdAt: data.captionUpdatedAt ?? e.createdAt,
                }
              : e,
          );
        });
        setEditingId(null);
        return;
      }

      const res = await fetch(
        `/api/media/${mediaId}/comments/${editingId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        entry?: MediaThreadEntry;
        error?: string;
      };
      if (!res.ok || !data.entry) {
        setError(data.error || "Couldn’t save.");
        return;
      }
      setEntries((prev) =>
        prev.map((e) => (e.id === editingId ? data.entry! : e)),
      );
      setEditingId(null);
    } catch {
      setError("Couldn’t save.");
    } finally {
      setSavingEdit(false);
    }
  }, [editDraft, editingId, mediaId, onCaptionChange, savingEdit]);

  const removeEntry = useCallback(
    async (entry: MediaThreadEntry) => {
      if (!entry.canDelete) return;
      setError(null);
      try {
        if (entry.kind === "caption") {
          const res = await fetch(`/api/media/${mediaId}/caption`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ caption: null }),
          });
          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            setError(data.error || "Couldn’t remove caption.");
            return;
          }
          setEntries((prev) => prev.filter((e) => e.id !== "caption"));
          onCaptionChange?.(null);
          return;
        }

        const res = await fetch(
          `/api/media/${mediaId}/comments/${entry.id}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(data.error || "Couldn’t delete.");
          return;
        }
        setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      } catch {
        setError("Couldn’t delete.");
      }
    },
    [mediaId, onCaptionChange],
  );

  function onComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      void post();
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void post();
  }

  const canPost = canComment && draft.trim().length > 0 && !posting;

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex items-center justify-between gap-2 px-0.5 pb-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          Family only
        </p>
      </div>

      <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-0.5">
        {entries.map((entry) => {
          const when = formatWhen(entry.editedAt ?? entry.createdAt);
          const isEditing = editingId === entry.id;
          return (
            <li key={entry.id} className="min-w-0">
              {isEditing ? (
                <div className="space-y-2">
                  <textarea
                    value={editDraft}
                    onChange={(e) =>
                      setEditDraft(
                        e.target.value.slice(
                          0,
                          entry.kind === "caption"
                            ? MEDIA_CAPTION_MAX_LENGTH
                            : MEDIA_COMMENT_MAX_LENGTH,
                        ),
                      )
                    }
                    rows={2}
                    disabled={savingEdit}
                    className="ui-input w-full resize-none text-sm leading-snug"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="ui-btn ui-btn-ghost ui-btn-sm"
                      disabled={savingEdit}
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="ui-btn ui-btn-primary ui-btn-sm"
                      disabled={savingEdit || !editDraft.trim()}
                      onClick={() => void saveEdit()}
                    >
                      {savingEdit ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-xs font-semibold text-ink">
                      {entry.authorName ||
                        (entry.kind === "caption" ? "Caption" : "Family")}
                    </span>
                    {when ? (
                      <span className="text-[11px] text-ink-muted">{when}</span>
                    ) : null}
                    {entry.editedAt ? (
                      <span className="text-[11px] text-ink-muted">edited</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-snug text-ink">
                    {entry.body}
                  </p>
                  {entry.canEdit || entry.canDelete ? (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {entry.canEdit ? (
                        <button
                          type="button"
                          className="text-[11px] font-medium text-accent-deep underline-offset-2 hover:underline"
                          onClick={() => {
                            setEditingId(entry.id);
                            setEditDraft(entry.body);
                            setError(null);
                          }}
                        >
                          Edit
                        </button>
                      ) : null}
                      {entry.canDelete ? (
                        <button
                          type="button"
                          className="text-[11px] font-medium text-ink-muted underline-offset-2 hover:underline"
                          onClick={() => void removeEntry(entry)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
        {loaded && entries.length === 0 ? (
          <li className="text-sm text-ink-muted">
            No captions yet — add the first note for your family.
          </li>
        ) : null}
      </ul>

      {canComment ? (
        <form
          onSubmit={onSubmit}
          className="mt-3 shrink-0 space-y-2 border-t border-ink/8 pt-3"
        >
          <label htmlFor={composerId} className="sr-only">
            Add a caption or comment
          </label>
          <textarea
            ref={composerRef}
            id={composerId}
            value={draft}
            onChange={(e) =>
              setDraft(e.target.value.slice(0, MEDIA_COMMENT_MAX_LENGTH))
            }
            onKeyDown={onComposerKeyDown}
            rows={2}
            maxLength={MEDIA_COMMENT_MAX_LENGTH}
            disabled={posting}
            placeholder="Add a caption or comment…"
            className="ui-input w-full resize-none text-sm leading-snug"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-ink-muted">
              {draft.length}/{MEDIA_COMMENT_MAX_LENGTH}
            </p>
            <button
              type="submit"
              className="ui-btn ui-btn-primary ui-btn-sm"
              disabled={!canPost}
            >
              {posting ? "Posting…" : "Post"}
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
