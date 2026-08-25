"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ScanFace, UserRound } from "lucide-react";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import type { SerializedPersonListItem } from "@/lib/people/queries";
import { trackFirstMovieEvent } from "@/lib/first-family-movie/track-client";
import { cn } from "@/lib/utils";

type Props = {
  mediaIds: string[];
  onContinue: () => void;
  onSkip?: () => void;
  skipPending?: boolean;
};

type RowState = {
  person: SerializedPersonListItem;
  draft: string;
  saving: boolean;
  savedName: string | null;
  error: string | null;
};

/**
 * People Discovery — name face clusters from the first-upload set.
 * Saves via existing PATCH /api/people/[id]. Continue is always allowed.
 */
export function FirstFamilyMoviePeopleDiscovery({
  mediaIds,
  onContinue,
  onSkip,
  skipPending = false,
}: Props) {
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/first-family-movie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "discover-people",
        mediaIds,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      people?: SerializedPersonListItem[];
      detecting?: boolean;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error || "Could not load people.");
    }
    return data;
  }, [mediaIds]);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    async function tick() {
      try {
        const data = await load();
        if (cancelled) return;

        if (data.detecting && attempts < 18) {
          setDetecting(true);
          setLoading(attempts === 0);
          attempts += 1;
          window.setTimeout(() => {
            if (!cancelled) void tick();
          }, 2200);
          return;
        }

        const people = data.people ?? [];
        setRows(
          people.map((person) => {
            const isUnnamed =
              !person.name?.trim() ||
              /^Person\s+\d+$/i.test(person.name.trim()) ||
              person.displayName === "Unnamed Person";
            return {
              person,
              draft: isUnnamed ? "" : person.displayName,
              saving: false,
              savedName: isUnnamed ? null : person.displayName,
              error: null,
            };
          }),
        );
        setDetecting(false);
        setLoading(false);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Could not load people.",
        );
        setDetecting(false);
        setLoading(false);
      }
    }

    void tick();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function saveName(personId: string) {
    const row = rows.find((r) => r.person.id === personId);
    if (!row) return;
    const trimmed = row.draft.trim();
    if (!trimmed) return;
    if (row.savedName === trimmed) return;

    setRows((prev) =>
      prev.map((r) =>
        r.person.id === personId
          ? { ...r, saving: true, error: null }
          : r,
      ),
    );

    try {
      const res = await fetch(`/api/people/${personId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        person?: SerializedPersonListItem;
      };
      if (!res.ok) {
        throw new Error(data.error || "Could not save that name.");
      }
      setRows((prev) =>
        prev.map((r) =>
          r.person.id === personId
            ? {
                ...r,
                saving: false,
                savedName: trimmed,
                person: data.person
                  ? { ...r.person, ...data.person, name: trimmed }
                  : { ...r.person, name: trimmed, displayName: trimmed },
                error: null,
              }
            : r,
        ),
      );
      trackFirstMovieEvent("first_movie_person_named", {
        personId,
      });
    } catch (err) {
      setRows((prev) =>
        prev.map((r) =>
          r.person.id === personId
            ? {
                ...r,
                saving: false,
                error:
                  err instanceof Error
                    ? err.message
                    : "Could not save that name.",
              }
            : r,
        ),
      );
    }
  }

  const namedCount = rows.filter((r) => Boolean(r.savedName)).length;

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col px-6 py-10 sm:px-8 sm:py-14">
      <p className="font-sans text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-deep)]">
        People
      </p>
      <h1 className="mt-4 font-display text-[clamp(1.75rem,6vw,2.35rem)] leading-tight tracking-tight text-[color:var(--ink)]">
        We found these people in your photos.
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[color:var(--ink-muted)] sm:text-base">
        Add a name — Mom, Noah, Grandma — so Family Memory Vault can recognize
        them next time.
      </p>

      <div className="mt-8 flex-1">
        {loading || detecting ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--app-radius-xl)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)]/80 px-6 py-14 text-center">
            <Loader2
              className="size-6 animate-spin text-[color:var(--accent-deep)]"
              aria-hidden
            />
            <p className="text-sm text-[color:var(--ink-muted)]">
              {detecting
                ? "Looking for faces in your photos…"
                : "Gathering people…"}
            </p>
          </div>
        ) : loadError ? (
          <div className="rounded-[var(--app-radius-xl)] border border-red-800/15 bg-red-50 px-5 py-6 text-sm text-red-900">
            {loadError}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center rounded-[var(--app-radius-xl)] border border-dashed border-[color:var(--border-strong)] bg-[color:var(--surface-elevated)]/70 px-6 py-12 text-center">
            <ScanFace
              className="size-8 text-[color:var(--ink-muted)]"
              aria-hidden
            />
            <p className="mt-4 font-medium text-[color:var(--ink)]">
              We’ll finalize people next
            </p>
            <p className="mt-2 max-w-sm text-sm text-[color:var(--ink-muted)]">
              Face recognition is still catching up — name them anytime from
              People in your vault. Continue whenever you’re ready.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {rows.map((row) => (
              <li
                key={row.person.id}
                className="flex items-start gap-3 rounded-[var(--app-radius-xl)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)]/90 p-3 sm:gap-4 sm:p-4"
              >
                <PersonAvatar
                  previewUrl={row.person.cover?.media.previewUrl ?? null}
                  boundingBox={row.person.cover?.boundingBox}
                  framing={{
                    avatarFocusX: row.person.avatarFocusX,
                    avatarFocusY: row.person.avatarFocusY,
                    avatarZoom: row.person.avatarZoom,
                  }}
                  alt=""
                  className="size-16 shrink-0 sm:size-[4.5rem]"
                />
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={`ffm-person-${row.person.id}`}
                    className="sr-only"
                  >
                    Name for this person
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id={`ffm-person-${row.person.id}`}
                      type="text"
                      value={row.draft}
                      placeholder="Mom, Noah, Grandma…"
                      maxLength={120}
                      disabled={row.saving}
                      onChange={(e) => {
                        const value = e.target.value;
                        setRows((prev) =>
                          prev.map((r) =>
                            r.person.id === row.person.id
                              ? { ...r, draft: value, error: null }
                              : r,
                          ),
                        );
                      }}
                      onBlur={() => void saveName(row.person.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      className="ui-input w-full text-base"
                      autoComplete="off"
                    />
                    {row.saving ? (
                      <Loader2
                        className="size-4 shrink-0 animate-spin text-[color:var(--ink-muted)]"
                        aria-hidden
                      />
                    ) : row.savedName ? (
                      <UserRound
                        className="size-4 shrink-0 text-[color:var(--accent-deep)]"
                        aria-hidden
                      />
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-xs text-[color:var(--ink-muted)]">
                    {row.person.photoCount} photo
                    {row.person.photoCount === 1 ? "" : "s"}
                    {row.savedName ? ` · Saved as ${row.savedName}` : ""}
                  </p>
                  {row.error ? (
                    <p className="mt-1 text-xs text-red-800" role="alert">
                      {row.error}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sticky bottom-0 mt-8 border-t border-[color:var(--border-subtle)] bg-[color:var(--canvas)]/90 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-sm">
        <button
          type="button"
          onClick={onContinue}
          disabled={skipPending}
          className={cn(
            "ui-btn ui-btn-primary inline-flex h-12 w-full items-center justify-center px-6 text-base font-semibold disabled:opacity-60",
          )}
        >
          Continue
        </button>
        {onSkip ? (
          <button
            type="button"
            onClick={onSkip}
            disabled={skipPending}
            className="ui-btn ui-btn-ghost mt-2 inline-flex h-11 w-full items-center justify-center px-5 text-sm font-semibold text-[color:var(--ink-muted)] disabled:opacity-60"
          >
            {skipPending ? "Skipping…" : "Skip"}
          </button>
        ) : null}
        <p className="mt-2 text-center text-xs text-[color:var(--ink-muted)]">
          {rows.length === 0
            ? "You can skip naming for now."
            : namedCount > 0
              ? `${namedCount} named — you can always edit later in People.`
              : "Name as many as you like, or continue with none."}
        </p>
      </div>
    </main>
  );
}
