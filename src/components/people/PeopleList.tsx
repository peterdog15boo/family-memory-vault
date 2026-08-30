"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2, ScanFace, Trash2, Upload } from "lucide-react";
import { FacePrivacyNote } from "@/components/people/FacePrivacyNote";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { useCopy, useTranslations } from "@/components/i18n/LocaleProvider";
import type { SerializedPersonListItem } from "@/lib/people/queries";
import { cn } from "@/lib/utils";

type PeopleListProps = {
  people: SerializedPersonListItem[];
  className?: string;
};

function photoLabel(count: number) {
  return `${count} photo${count === 1 ? "" : "s"}`;
}

export function PeopleList({ people: initialPeople, className }: PeopleListProps) {
  const router = useRouter();
  const copy = useCopy();
  const t = useTranslations();
  const [people, setPeople] = useState(initialPeople);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setPeople(initialPeople);
  }, [initialPeople]);

  function deletePerson(personId: string) {
    setError(null);
    setPendingId(personId);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/people/${personId}`, {
          method: "DELETE",
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error || "Could not delete person.");
        }
        setPeople((prev) => prev.filter((p) => p.id !== personId));
        setConfirmId(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed.");
      } finally {
        setPendingId(null);
      }
    });
  }

  if (people.length === 0) {
    return (
      <div className={cn(className)}>
        <EmptyState
          icon={ScanFace}
          title={copy.empty.people.title}
          description={copy.empty.people.description}
          action={{
            href: "/upload",
            label: t("pages.uploadPhotos"),
            icon: Upload,
          }}
          size="large"
        />
        <FacePrivacyNote className="mx-auto mt-4 max-w-md justify-center text-left" />
      </div>
    );
  }

  return (
    <div className={className}>
      {error ? (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {people.map((person, index) => {
          const isConfirming = confirmId === person.id;
          const isBusy = pending && pendingId === person.id;

          return (
            <li key={person.id} className="relative">
              <Link
                href={`/people/${person.id}`}
                className="list-card people-card group flex flex-col items-center rounded-2xl border border-ink/8 bg-canvas/80 px-5 pb-5 pt-7 text-center transition"
                style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
              >
                <PersonAvatar
                  previewUrl={person.cover?.media.previewUrl ?? null}
                  boundingBox={person.cover?.boundingBox}
                  framing={{
                    avatarFocusX: person.avatarFocusX,
                    avatarFocusY: person.avatarFocusY,
                    avatarZoom: person.avatarZoom,
                  }}
                  alt={person.displayName}
                  className="people-card-avatar size-28 ring-4 ring-canvas transition duration-300 group-hover:ring-accent/15 sm:size-32"
                />
                <h3 className="mt-5 font-display text-xl tracking-tight text-ink transition group-hover:text-accent-deep">
                  {person.displayName}
                </h3>
                <p className="mt-1 text-sm text-ink-muted">
                  {photoLabel(person.photoCount)}
                </p>
              </Link>

              {isConfirming ? (
                <div className="absolute inset-x-2 bottom-2 z-10 rounded-xl border border-red-200 bg-canvas/95 p-3 text-left shadow-lg">
                  <p className="text-xs leading-relaxed text-ink-muted">
                    Delete <span className="font-medium text-ink">{person.displayName}</span>?
                    Photos stay in your photo library; this person card is removed.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => deletePerson(person.id)}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-red-700 px-2 py-1.5 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-60"
                    >
                      {isBusy ? (
                        <Loader2 className="size-3 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="size-3" aria-hidden />
                      )}
                      Delete
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => setConfirmId(null)}
                      className="rounded-md border border-ink/10 px-2 py-1.5 text-xs text-ink hover:bg-canvas-deep disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  aria-label={`Delete ${person.displayName}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setConfirmId(person.id);
                    setError(null);
                  }}
                  className="absolute right-2 top-2 z-10 inline-flex size-8 items-center justify-center rounded-md border border-ink/8 bg-canvas/90 text-ink-muted transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
