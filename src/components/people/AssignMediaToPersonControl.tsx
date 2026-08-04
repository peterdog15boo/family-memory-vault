"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Loader2, UserMinus, UserRound } from "lucide-react";
import type {
  SerializedMediaFaceLabel,
  SerializedPersonListItem,
} from "@/lib/people/queries";
import { cn } from "@/lib/utils";

type AssignMediaToPersonControlProps = {
  mediaId: string;
  /** Optional preloaded people list; otherwise fetched from /api/people. */
  people?: SerializedPersonListItem[];
  className?: string;
  onAssigned?: () => void;
  onUnassigned?: () => void;
};

type LinkedPerson = {
  personId: string;
  displayName: string;
};

/**
 * Attach a clean photo or video to a person from the media viewer.
 * Works even when no face boxes were detected. Shows current links + remove.
 */
export function AssignMediaToPersonControl({
  mediaId,
  people: peopleProp,
  className,
  onAssigned,
  onUnassigned,
}: AssignMediaToPersonControlProps) {
  const [people, setPeople] = useState<SerializedPersonListItem[]>(
    peopleProp ?? [],
  );
  const [linked, setLinked] = useState<LinkedPerson[]>([]);
  const [personId, setPersonId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyPersonId, setBusyPersonId] = useState<string | null>(null);

  const refreshLinks = useCallback(async () => {
    const res = await fetch(`/api/media/${mediaId}/faces`);
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      faces?: SerializedMediaFaceLabel[];
    };
    if (!res.ok) {
      throw new Error(data.error || "Could not load people on this item.");
    }
    const byPerson = new Map<string, LinkedPerson>();
    for (const face of data.faces ?? []) {
      if (!face.personId) continue;
      if (byPerson.has(face.personId)) continue;
      byPerson.set(face.personId, {
        personId: face.personId,
        displayName: face.displayName || "Person",
      });
    }
    setLinked([...byPerson.values()]);
  }, [mediaId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotice(null);
    setPersonId("");

    async function load() {
      try {
        const peoplePromise = peopleProp
          ? Promise.resolve(peopleProp)
          : fetch("/api/people").then(async (res) => {
              const data = (await res.json().catch(() => ({}))) as {
                error?: string;
                people?: SerializedPersonListItem[];
              };
              if (!res.ok) {
                throw new Error(data.error || "Could not load people.");
              }
              return data.people ?? [];
            });

        const [nextPeople] = await Promise.all([peoplePromise, refreshLinks()]);
        if (cancelled) return;
        setPeople(nextPeople);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not load people.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [mediaId, peopleProp, refreshLinks]);

  const linkedIds = useMemo(
    () => new Set(linked.map((p) => p.personId)),
    [linked],
  );

  const addablePeople = useMemo(
    () => people.filter((p) => !linkedIds.has(p.id)),
    [people, linkedIds],
  );

  function assign() {
    if (!personId) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/people/${personId}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaIds: [mediaId] }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          assigned?: string[];
          alreadyAssigned?: string[];
          skipped?: { mediaId: string; reason: string }[];
        };
        if (!res.ok) {
          throw new Error(data.error || "Could not add to person.");
        }
        if (data.skipped?.[0]) {
          throw new Error(data.skipped[0].reason);
        }
        if ((data.alreadyAssigned?.length ?? 0) > 0) {
          setNotice("Already on that person.");
        } else {
          const name =
            people.find((p) => p.id === personId)?.displayName ?? "person";
          setNotice(`Added to ${name}.`);
        }
        setPersonId("");
        await refreshLinks();
        onAssigned?.();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not add to person.",
        );
      }
    });
  }

  function unassign(targetPersonId: string, displayName: string) {
    setError(null);
    setNotice(null);
    setBusyPersonId(targetPersonId);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/people/${targetPersonId}/photos`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaIds: [mediaId] }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || "Could not remove from person.");
        }
        setNotice(`Removed from ${displayName}.`);
        await refreshLinks();
        onUnassigned?.();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not remove from person.",
        );
      } finally {
        setBusyPersonId(null);
      }
    });
  }

  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 text-xs text-ink-muted",
          className,
        )}
      >
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Loading people…
      </div>
    );
  }

  if (people.length === 0 && linked.length === 0) {
    return (
      <p className={cn("text-xs text-ink-muted", className)}>
        No people yet — open People after faces are detected, or create one
        there first.
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {linked.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {linked.map((person) => {
            const busy = pending && busyPersonId === person.personId;
            return (
              <li
                key={person.personId}
                className="flex items-center justify-between gap-2 rounded-md border border-ink/10 bg-canvas-deep/40 px-2.5 py-1.5"
              >
                <span className="min-w-0 truncate text-sm text-ink">
                  On {person.displayName}
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => unassign(person.personId, person.displayName)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-800 transition hover:bg-red-50 disabled:opacity-60"
                  aria-label={`Remove from ${person.displayName}`}
                >
                  {busy ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                  ) : (
                    <UserMinus className="size-3" aria-hidden />
                  )}
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {addablePeople.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`assign-person-${mediaId}`}>
            Add to person
          </label>
          <select
            id={`assign-person-${mediaId}`}
            value={personId}
            disabled={pending}
            onChange={(e) => setPersonId(e.target.value)}
            className="min-w-[10rem] flex-1 rounded-md border border-ink/15 bg-canvas px-2.5 py-1.5 text-sm outline-none ring-accent/30 focus:ring-2 disabled:opacity-60"
          >
            <option value="">Add to person…</option>
            {addablePeople.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending || !personId}
            onClick={assign}
            className="inline-flex items-center gap-1.5 rounded-md border border-ink/10 bg-canvas px-3 py-1.5 text-sm font-medium text-ink transition hover:border-accent/40 hover:bg-canvas-deep disabled:opacity-60"
          >
            {pending && !busyPersonId ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <UserRound className="size-3.5" aria-hidden />
            )}
            Add
          </button>
        </div>
      ) : people.length > 0 ? (
        <p className="text-xs text-ink-muted">
          Already linked to everyone in your People list.
        </p>
      ) : null}

      {error ? <p className="text-xs text-red-800">{error}</p> : null}
      {notice ? <p className="text-xs text-accent-deep">{notice}</p> : null}
    </div>
  );
}
