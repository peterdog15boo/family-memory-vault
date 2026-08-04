"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, UserRound } from "lucide-react";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import type {
  SerializedMediaFaceLabel,
  SerializedPersonListItem,
} from "@/lib/people/queries";
import { cn } from "@/lib/utils";

type FaceLabelEditorProps = {
  mediaId: string;
  people: SerializedPersonListItem[];
  onChanged?: () => void;
  className?: string;
};

/**
 * Label each detected face on a photo or video — who is this?
 */
export function FaceLabelEditor({
  mediaId,
  people,
  onChanged,
  className,
}: FaceLabelEditorProps) {
  const [faces, setFaces] = useState<SerializedMediaFaceLabel[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyFaceId, setBusyFaceId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    fetch(`/api/media/${mediaId}/faces`)
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          faces?: SerializedMediaFaceLabel[];
        };
        if (!response.ok) {
          throw new Error(data.error || "Could not load faces.");
        }
        if (!cancelled) setFaces(data.faces ?? []);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Load failed.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  function saveLabel(faceId: string, personId: string | null) {
    setSaveError(null);
    setBusyFaceId(faceId);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/faces/${faceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personId }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          faces?: SerializedMediaFaceLabel[];
        };
        if (!response.ok) {
          throw new Error(data.error || "Could not update label.");
        }
        if (data.faces) setFaces(data.faces);
        onChanged?.();
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Update failed.");
      } finally {
        setBusyFaceId(null);
      }
    });
  }

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 px-4 py-3 text-sm text-ink-muted", className)}>
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
        Loading faces…
      </div>
    );
  }

  if (loadError) {
    return (
      <p className={cn("px-4 py-3 text-sm text-red-800", className)}>{loadError}</p>
    );
  }

  if (faces.length === 0) {
    return (
      <div className={cn("border-t border-ink/8 px-4 py-3", className)}>
        <p className="text-sm text-ink-muted">
          No faces detected on this item. You can still assign the whole photo
          or video to someone from People → Add photos / videos, or use{" "}
          <span className="font-medium text-ink">Add to person</span> in the
          media viewer.
        </p>
        {people.length > 0 ? (
          <ManualWholePhotoAssign
            mediaId={mediaId}
            people={people}
            onChanged={onChanged}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("border-t border-ink/8 px-4 py-3", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        Who is in this?
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        Change a label if automatic matching got it wrong.
      </p>
      {saveError ? (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
          {saveError}
        </p>
      ) : null}
      <ul className="mt-3 space-y-3">
        {faces.map((face) => {
          const busy = pending && busyFaceId === face.faceId;
          return (
            <li key={face.faceId} className="flex items-center gap-3">
              <PersonAvatar
                previewUrl={face.media.previewUrl}
                boundingBox={face.boundingBox}
                alt={face.displayName}
                className="size-12 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <label className="block text-left">
                  <span className="sr-only">Person for this face</span>
                  <select
                    value={face.personId ?? ""}
                    disabled={busy}
                    onChange={(e) => {
                      const value = e.target.value;
                      saveLabel(face.faceId, value === "" ? null : value);
                    }}
                    className="w-full rounded-md border border-ink/15 bg-canvas px-2.5 py-1.5 text-sm outline-none ring-accent/30 focus:ring-2 disabled:opacity-60"
                  >
                    <option value="">Unlabeled</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {busy ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-ink-muted" aria-hidden />
              ) : (
                <UserRound className="size-3.5 shrink-0 text-ink/30" aria-hidden />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ManualWholePhotoAssign({
  mediaId,
  people,
  onChanged,
}: {
  mediaId: string;
  people: SerializedPersonListItem[];
  onChanged?: () => void;
}) {
  const [personId, setPersonId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function assign() {
    if (!personId) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/people/${personId}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaIds: [mediaId] }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          skipped?: { reason: string }[];
        };
        if (!res.ok) {
          throw new Error(data.error || "Could not assign to person.");
        }
        if (data.skipped?.[0]) {
          throw new Error(data.skipped[0].reason);
        }
        onChanged?.();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not assign to person.",
        );
      }
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <select
        value={personId}
        disabled={pending}
        onChange={(e) => setPersonId(e.target.value)}
        className="min-w-[10rem] flex-1 rounded-md border border-ink/15 bg-canvas px-2.5 py-1.5 text-sm outline-none ring-accent/30 focus:ring-2 disabled:opacity-60"
      >
        <option value="">Assign to person…</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.displayName}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending || !personId}
        onClick={assign}
        className="inline-flex items-center gap-1.5 rounded-md border border-ink/10 px-3 py-1.5 text-xs font-medium text-ink hover:bg-ink/5 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin" aria-hidden />
        ) : null}
        Assign
      </button>
      {error ? <p className="w-full text-xs text-red-800">{error}</p> : null}
    </div>
  );
}
