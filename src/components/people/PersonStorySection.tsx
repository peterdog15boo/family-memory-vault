"use client";

import {
  useCallback,
  useId,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { BookOpenText, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import {
  PERSON_STORY_POST_MAX_LENGTH,
  type PersonStoryNotesView,
  type PersonStoryPostView,
} from "@/lib/people/story-posts-shared";
import { cn } from "@/lib/utils";

type Props = {
  personId: string;
  displayName: string;
  initialPosts: PersonStoryPostView[];
  initialNotes: PersonStoryNotesView;
  canPost: boolean;
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
 * Person Story — growing family feed + collapsible “Notes from photos”.
 * Matches photo comment thread: oldest → newest, composer at the bottom.
 */
export function PersonStorySection({
  personId,
  displayName,
  initialPosts,
  initialNotes,
  canPost,
  className,
}: Props) {
  const composerId = useId();
  const [posts, setPosts] = useState(initialPosts);
  const [notes, setNotes] = useState(initialNotes);
  const [notesOpen, setNotesOpen] = useState(Boolean(initialNotes.body));
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [refreshingNotes, setRefreshingNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const refreshNotes = useCallback(async () => {
    if (refreshingNotes) return;
    setRefreshingNotes(true);
    setError(null);
    try {
      const res = await fetch(`/api/people/${personId}/story`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshNotes: true }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        notes?: PersonStoryNotesView;
        error?: string;
      };
      if (!res.ok || !data.notes) {
        setError(data.error || "Couldn’t refresh notes.");
        return;
      }
      setNotes(data.notes);
      if (data.notes.body) setNotesOpen(true);
    } catch {
      setError("Couldn’t refresh notes.");
    } finally {
      setRefreshingNotes(false);
    }
  }, [personId, refreshingNotes]);

  const post = useCallback(async () => {
    const body = draft.trim();
    if (!body || posting || !canPost) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/people/${personId}/story`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        post?: PersonStoryPostView;
        error?: string;
      };
      if (!res.ok || !data.post) {
        setError(data.error || "Couldn’t post.");
        return;
      }
      setPosts((prev) => [...prev, data.post!]);
      setDraft("");
    } catch {
      setError("Couldn’t post.");
    } finally {
      setPosting(false);
    }
  }, [canPost, draft, personId, posting]);

  const saveEdit = useCallback(async () => {
    if (!editingId || savingEdit) return;
    const body = editDraft.trim();
    if (!body) {
      setError("Story cannot be empty.");
      return;
    }
    setSavingEdit(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/people/${personId}/story/posts/${editingId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        post?: PersonStoryPostView;
        error?: string;
      };
      if (!res.ok || !data.post) {
        setError(data.error || "Couldn’t save.");
        return;
      }
      setPosts((prev) =>
        prev.map((p) => (p.id === editingId ? data.post! : p)),
      );
      setEditingId(null);
    } catch {
      setError("Couldn’t save.");
    } finally {
      setSavingEdit(false);
    }
  }, [editDraft, editingId, personId, savingEdit]);

  const removePost = useCallback(
    async (postRow: PersonStoryPostView) => {
      if (!postRow.canDelete) return;
      setError(null);
      try {
        const res = await fetch(
          `/api/people/${personId}/story/posts/${postRow.id}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(data.error || "Couldn’t delete.");
          return;
        }
        setPosts((prev) => prev.filter((p) => p.id !== postRow.id));
      } catch {
        setError("Couldn’t delete.");
      }
    },
    [personId],
  );

  function onComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void post();
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void post();
  }

  const canSubmit = canPost && draft.trim().length > 0 && !posting;
  const hasNotes = Boolean(notes.body?.trim());

  return (
    <section
      className={cn(
        "rounded-2xl border border-ink/8 bg-canvas/60 px-4 py-4 sm:px-5",
        className,
      )}
      aria-labelledby="person-story-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2
          id="person-story-heading"
          className="flex items-center gap-2 text-sm font-semibold text-ink"
        >
          <BookOpenText className="size-4 text-accent" aria-hidden />
          Story
        </h2>
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          Family only
        </p>
      </div>

      <ul className="mt-4 space-y-4">
        {posts.map((entry) => {
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
                        e.target.value.slice(0, PERSON_STORY_POST_MAX_LENGTH),
                      )
                    }
                    rows={3}
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
                <div>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-xs font-semibold text-ink">
                      {entry.authorName || "Family"}
                    </span>
                    {when ? (
                      <span className="text-[11px] text-ink-muted">{when}</span>
                    ) : null}
                    {entry.editedAt ? (
                      <span className="text-[11px] text-ink-muted">edited</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">
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
                          onClick={() => void removePost(entry)}
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
        {posts.length === 0 ? (
          <li className="text-sm text-ink-muted">
            Be the first to write a story about {displayName}. Photo notes can
            help.
          </li>
        ) : null}
      </ul>

      <div className="mt-4 border-t border-ink/8 pt-3">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold text-ink"
          aria-expanded={notesOpen}
          onClick={() => setNotesOpen((o) => !o)}
        >
          <span>
            From photo captions
            {notes.sourceCount > 0 ? ` (${notes.sourceCount})` : ""}
          </span>
          <ChevronDown
            className={cn(
              "size-4 text-ink-muted transition",
              notesOpen && "rotate-180",
            )}
            aria-hidden
          />
        </button>
        {notesOpen ? (
          <div className="mt-2 space-y-2">
            {hasNotes ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
                {notes.body}
              </p>
            ) : (
              <p className="text-sm text-ink-muted">
                Add captions on photos of {displayName} to build notes.
              </p>
            )}
            <button
              type="button"
              onClick={() => void refreshNotes()}
              disabled={refreshingNotes}
              className="ui-btn ui-btn-secondary ui-btn-sm inline-flex items-center gap-1.5"
            >
              {refreshingNotes ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="size-3.5" aria-hidden />
              )}
              Refresh notes
            </button>
          </div>
        ) : null}
      </div>

      {canPost ? (
        <form
          onSubmit={onSubmit}
          className="mt-4 space-y-2 border-t border-ink/8 pt-3"
        >
          <label htmlFor={composerId} className="sr-only">
            Share a story about {displayName}
          </label>
          <textarea
            id={composerId}
            value={draft}
            onChange={(e) =>
              setDraft(e.target.value.slice(0, PERSON_STORY_POST_MAX_LENGTH))
            }
            onKeyDown={onComposerKeyDown}
            rows={3}
            maxLength={PERSON_STORY_POST_MAX_LENGTH}
            disabled={posting}
            placeholder={`Share a story about ${displayName}…`}
            className="ui-input w-full resize-none text-sm leading-snug"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-ink-muted">
              {draft.length}/{PERSON_STORY_POST_MAX_LENGTH}
            </p>
            <button
              type="submit"
              className="ui-btn ui-btn-primary ui-btn-sm"
              disabled={!canSubmit}
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
    </section>
  );
}
