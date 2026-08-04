"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  BookImage,
  Check,
  GitMerge,
  ImagePlus,
  Loader2,
  Pencil,
  Star,
  Trash2,
  UserMinus,
  X,
} from "lucide-react";
import { PersonAvatar } from "@/components/people/PersonAvatar";
import { AvatarFramingEditor } from "@/components/people/AvatarFramingEditor";
import { FacePrivacyNote } from "@/components/people/FacePrivacyNote";
import { FaceLabelEditor } from "@/components/people/FaceLabelEditor";
import { AddPhotosToPersonSheet } from "@/components/people/AddPhotosToPersonSheet";
import { MediaThumb } from "@/components/memories/MediaThumb";
import { MediaViewerMedia } from "@/components/media/MediaViewerMedia";
import type {
  SerializedPersonDetail,
  SerializedPersonListItem,
} from "@/lib/people/queries";
import { cn } from "@/lib/utils";

type PersonDetailViewProps = {
  initialPerson: SerializedPersonDetail;
  /** Other people this person can be merged into (keepers). */
  mergeCandidates: SerializedPersonListItem[];
  /** All people for face labeling dropdowns. */
  allPeople: SerializedPersonListItem[];
};

function mediaLabel(count: number) {
  return `${count} item${count === 1 ? "" : "s"}`;
}

function gallerySectionTitle(photos: { type?: string }[]) {
  const hasPhoto = photos.some((p) => p.type === "photo");
  const hasVideo = photos.some((p) => p.type === "video");
  if (hasPhoto && hasVideo) return "Photos & videos";
  if (hasVideo) return "Videos";
  return "Photos";
}

function formatDateRange(
  fromIso: string | null,
  toIso: string | null,
): string | null {
  if (!fromIso || !toIso) return null;
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  if (from.toDateString() === to.toDateString()) {
    return from.toLocaleDateString(undefined, opts);
  }
  const sameYear = from.getFullYear() === to.getFullYear();
  if (sameYear) {
    return `${from.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    })} – ${to.toLocaleDateString(undefined, opts)}`;
  }
  return `${from.toLocaleDateString(undefined, opts)} – ${to.toLocaleDateString(undefined, opts)}`;
}

export function PersonDetailView({
  initialPerson,
  mergeCandidates,
  allPeople,
}: PersonDetailViewProps) {
  const router = useRouter();
  const [person, setPerson] = useState(initialPerson);
  const [candidates, setCandidates] = useState(mergeCandidates);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(
    person.displayName === "Unnamed Person" ? "" : person.name,
  );
  const [mergeOpen, setMergeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [targetPersonId, setTargetPersonId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busyFaceId, setBusyFaceId] = useState<string | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [viewerMounted, setViewerMounted] = useState(false);
  const [addPhotosOpen, setAddPhotosOpen] = useState(false);

  const lightbox = useMemo(
    () => person.photos.find((p) => p.id === lightboxId) ?? null,
    [person.photos, lightboxId],
  );

  useEffect(() => {
    setViewerMounted(true);
  }, []);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  useEffect(() => {
    if (!lightbox) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [lightbox]);

  const dateRange = formatDateRange(person.photoDateFrom, person.photoDateTo);
  const createMemoryHref = `/memories/new?fromPerson=${encodeURIComponent(person.id)}`;

  function applyPerson(next: SerializedPersonDetail) {
    setPerson(next);
    setName(next.displayName === "Unnamed Person" ? "" : next.name);
  }

  async function patchPerson(body: Record<string, unknown>) {
    const response = await fetch(`/api/people/${person.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      person?: SerializedPersonDetail;
    };
    if (!response.ok || !data.person) {
      throw new Error(data.error || "Could not update person.");
    }
    applyPerson(data.person);
    return data.person;
  }

  function saveName() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name cannot be empty.");
      return;
    }

    startTransition(async () => {
      try {
        await patchPerson({ name: trimmed });
        setEditing(false);
        setNotice("Name saved.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Rename failed.");
      }
    });
  }

  function setCover(faceId: string) {
    if (person.cover?.faceId === faceId) return;
    setError(null);
    setBusyFaceId(faceId);
    startTransition(async () => {
      try {
        await patchPerson({ coverFaceId: faceId });
        setNotice("Cover updated.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not set cover.");
      } finally {
        setBusyFaceId(null);
      }
    });
  }

  function removeMediaFromPerson(faceId: string, mediaId: string, mediaType?: string) {
    setError(null);
    setNotice(null);
    setBusyFaceId(faceId);
    const kind = mediaType === "video" ? "Video" : "Photo";
    startTransition(async () => {
      try {
        const response = await fetch(`/api/faces/${faceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personId: null }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error || `Could not remove ${kind.toLowerCase()}.`);
        }
        setPerson((prev) => ({
          ...prev,
          photos: prev.photos.filter((p) => p.faceId !== faceId),
          photoCount: Math.max(0, prev.photoCount - 1),
          cover: prev.cover?.faceId === faceId ? null : prev.cover,
        }));
        if (lightboxId === mediaId) setLightboxId(null);
        setNotice(
          `${kind} removed from this person. It stays in your library.`,
        );
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : `Could not remove ${kind.toLowerCase()}.`,
        );
      } finally {
        setBusyFaceId(null);
      }
    });
  }

  function confirmMerge() {
    if (!targetPersonId) {
      setError("Choose who to merge this person into.");
      return;
    }
    setError(null);
    const target = candidates.find((c) => c.id === targetPersonId);
    const sourceId = person.id;

    startTransition(async () => {
      try {
        // Current person is absorbed into the selected keeper (target).
        const response = await fetch(`/api/people/${targetPersonId}/merge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourcePersonId: sourceId }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          person?: SerializedPersonDetail;
        };
        if (!response.ok || !data.person) {
          throw new Error(data.error || "Could not merge people.");
        }
        setMergeOpen(false);
        setTargetPersonId("");
        setCandidates((prev) => prev.filter((c) => c.id !== sourceId));
        setNotice(
          target
            ? `Merged into ${target.displayName}. Keeping their name and cover.`
            : "People merged.",
        );
        router.replace(`/people/${data.person.id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Merge failed.");
      }
    });
  }

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/people/${person.id}`, {
          method: "DELETE",
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error || "Could not delete person.");
        }
        router.replace("/people");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed.");
        setDeleteOpen(false);
      }
    });
  }

  return (
    <div className="app-page family-photo-area mx-auto max-w-5xl">
      <Link
        href="/people"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition hover:text-ink"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        All people
      </Link>

      <header className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:items-end sm:gap-8">
        <PersonAvatar
          previewUrl={person.cover?.media.previewUrl ?? null}
          boundingBox={person.cover?.boundingBox}
          framing={{
            avatarFocusX: person.avatarFocusX,
            avatarFocusY: person.avatarFocusY,
            avatarZoom: person.avatarZoom,
          }}
          alt={person.displayName}
          shape="soft"
          className="size-36 shrink-0 shadow-[0_18px_40px_-24px_rgba(42,40,37,0.45)] sm:size-44"
        />

        <div className="min-w-0 flex-1 text-center sm:pb-1 sm:text-left">
          {editing ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Their name"
                maxLength={120}
                autoFocus
                className="w-full rounded-md border border-ink/15 bg-canvas px-3 py-2 font-display text-2xl tracking-tight text-ink outline-none ring-accent/30 focus:ring-2 sm:max-w-md"
              />
              <div className="flex justify-center gap-2 sm:justify-start">
                <button
                  type="button"
                  onClick={saveName}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-deep disabled:opacity-60"
                >
                  {pending ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Check className="size-3.5" aria-hidden />
                  )}
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setName(
                      person.displayName === "Unnamed Person"
                        ? ""
                        : person.name,
                    );
                    setError(null);
                  }}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-md border border-ink/10 px-3 py-2 text-sm text-ink hover:bg-canvas-deep"
                >
                  <X className="size-3.5" aria-hidden />
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 sm:items-start">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <h1 className="page-title font-display text-3xl tracking-tight text-ink sm:text-4xl">
                  {person.displayName}
                </h1>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(true);
                    setNotice(null);
                    setError(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-ink/10 bg-canvas px-2.5 py-1.5 text-xs font-medium text-ink transition hover:border-accent/35 hover:bg-canvas-deep"
                >
                  <Pencil className="size-3" aria-hidden />
                  Rename
                </button>
              </div>
              <p className="text-sm text-ink-muted">
                {mediaLabel(person.photoCount)}
                {dateRange ? (
                  <>
                    <span aria-hidden> · </span>
                    <time dateTime={person.photoDateFrom ?? undefined}>
                      {dateRange}
                    </time>
                  </>
                ) : null}
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <Link
              href={createMemoryHref}
              className={cn(
                "inline-flex items-center gap-2 rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-foreground transition hover:bg-accent-deep",
                person.photos.length === 0 &&
                  "pointer-events-none opacity-50",
              )}
              aria-disabled={person.photos.length === 0}
            >
              <BookImage className="size-3.5" aria-hidden />
              Create memory
            </Link>
            <button
              type="button"
              onClick={() => {
                setMergeOpen((open) => !open);
                setDeleteOpen(false);
                setError(null);
                setNotice(null);
              }}
              disabled={candidates.length === 0}
              className={cn(
                "inline-flex items-center gap-2 rounded-md border border-ink/10 bg-canvas px-3 py-2 text-sm font-medium text-ink transition hover:border-accent/35 hover:bg-canvas-deep",
                candidates.length === 0 && "cursor-not-allowed opacity-50",
              )}
            >
              <GitMerge className="size-3.5" aria-hidden />
              Merge people
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteOpen((open) => !open);
                setMergeOpen(false);
                setError(null);
                setNotice(null);
              }}
              className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50/80 px-3 py-2 text-sm font-medium text-red-800 transition hover:bg-red-100"
            >
              <Trash2 className="size-3.5" aria-hidden />
              Delete
            </button>
          </div>
        </div>
      </header>

      {person.cover?.media.previewUrl ? (
        <AvatarFramingEditor
          className="mt-6"
          personId={person.id}
          displayName={person.displayName}
          previewUrl={person.cover.media.previewUrl}
          boundingBox={person.cover.boundingBox}
          stored={{
            avatarFocusX: person.avatarFocusX,
            avatarFocusY: person.avatarFocusY,
            avatarZoom: person.avatarZoom,
          }}
          onSaved={(next) => {
            setPerson((prev) => ({ ...prev, ...next }));
            setNotice("Avatar framing saved.");
            setError(null);
          }}
          onError={(message) => {
            setError(message);
            setNotice(null);
          }}
        />
      ) : null}

      {mergeOpen ? (
        <div className="mt-6 rounded-xl border border-ink/10 bg-canvas-deep/40 px-4 py-4 sm:px-5">
          <p className="font-display text-lg text-ink">Merge into another person</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            Media from <span className="font-medium text-ink">{person.displayName}</span>{" "}
            will move to the person you choose. That person keeps their name and
            cover photo. This can&apos;t be undone easily.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-left text-sm text-ink">
              <span className="mb-1.5 block text-xs font-medium text-ink-muted">
                Merge into
              </span>
              <select
                value={targetPersonId}
                onChange={(e) => setTargetPersonId(e.target.value)}
                className="w-full rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm outline-none ring-accent/30 focus:ring-2"
              >
                <option value="">Select who to keep…</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName} ({mediaLabel(c.photoCount)})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={confirmMerge}
              disabled={pending || !targetPersonId}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent-deep disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <GitMerge className="size-3.5" aria-hidden />
              )}
              Confirm merge
            </button>
          </div>
        </div>
      ) : null}

      {deleteOpen ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50/60 px-4 py-4 sm:px-5">
          <p className="font-display text-lg text-ink">Delete this person?</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            Removes <span className="font-medium text-ink">{person.displayName}</span>{" "}
            from People. Your photos stay saved; only this person card is
            removed. This can&apos;t be undone.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={confirmDelete}
              disabled={pending}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-red-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-3.5" aria-hidden />
              )}
              Delete person
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-md border border-ink/10 bg-canvas px-4 py-2.5 text-sm text-ink hover:bg-canvas-deep disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-4 rounded-md border border-accent/20 bg-accent/5 px-3 py-2 text-sm text-accent-deep">
          {notice}
        </p>
      ) : null}

      <section className="mt-10">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl tracking-tight text-ink">
              {gallerySectionTitle(person.photos)}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Clean photos and videos linked to this person. Add items manually
              if face recognition missed them, open one to fix labels, or remove
              one that doesn&apos;t belong here.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {person.photos.length > 0 ? (
              <p className="text-xs text-ink-muted">
                {mediaLabel(person.photos.length)}
                {dateRange ? ` · ${dateRange}` : ""}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setAddPhotosOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-ink/10 bg-canvas px-3 py-1.5 text-sm font-medium text-ink transition hover:border-accent/40 hover:bg-canvas-deep"
            >
              <ImagePlus className="size-3.5" aria-hidden />
              Add photos / videos
            </button>
          </div>
        </div>

        {person.photos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink/15 bg-canvas-deep/30 px-6 py-12 text-center">
            <p className="font-display text-lg text-ink">No media to show</p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
              Face detection may still be running — or add photos and videos
              yourself if recognition missed them.
            </p>
            <button
              type="button"
              onClick={() => setAddPhotosOpen(true)}
              className="ui-btn ui-btn-primary mt-5"
            >
              <ImagePlus className="size-4" aria-hidden />
              Add photos / videos
            </button>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {person.photos.map((photo) => {
              const isCover = person.cover?.faceId === photo.faceId;
              const coverBusy = busyFaceId === photo.faceId && pending;

              return (
                <li key={photo.id}>
                  <div className="media-tile group relative aspect-square overflow-hidden rounded-xl border border-ink/8 bg-canvas-deep transition hover:border-accent/30">
                    <button
                      type="button"
                      onClick={() => setLightboxId(photo.id)}
                      className="absolute inset-0 w-full"
                      aria-label={`View ${photo.type === "video" ? "video" : "photo"} of ${person.displayName}`}
                    >
                      <MediaThumb
                        item={photo}
                        alt={`${person.displayName} in a family photo`}
                      />
                    </button>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setCover(photo.faceId);
                      }}
                      disabled={pending || isCover}
                      className={cn(
                        "absolute bottom-2 right-2 z-10 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium shadow-sm backdrop-blur-sm transition",
                        isCover
                          ? "bg-accent text-accent-foreground"
                          : "bg-canvas/90 text-ink-muted opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-canvas hover:text-ink",
                      )}
                      aria-label={
                        isCover ? "Current cover face" : "Set as cover face"
                      }
                    >
                      {coverBusy ? (
                        <Loader2 className="size-3 animate-spin" aria-hidden />
                      ) : (
                        <Star
                          className={cn("size-3", isCover && "fill-current")}
                          aria-hidden
                        />
                      )}
                      {isCover ? "Cover" : "Set cover"}
                    </button>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeMediaFromPerson(photo.faceId, photo.id, photo.type);
                      }}
                      disabled={pending && busyFaceId === photo.faceId}
                      className="absolute bottom-2 left-2 z-10 inline-flex items-center gap-1 rounded-md bg-canvas/90 px-2 py-1 text-[11px] font-medium text-ink-muted shadow-sm backdrop-blur-sm transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-red-50 hover:text-red-800"
                      aria-label={`Remove this ${photo.type === "video" ? "video" : "photo"} from ${person.displayName}`}
                    >
                      {pending && busyFaceId === photo.faceId ? (
                        <Loader2 className="size-3 animate-spin" aria-hidden />
                      ) : (
                        <UserMinus className="size-3" aria-hidden />
                      )}
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {person.photos.length > 0 ? (
        <div className="mt-8 flex justify-center sm:justify-start">
          <Link
            href={createMemoryHref}
            className="inline-flex items-center gap-2 rounded-md border border-accent/25 bg-accent/5 px-4 py-2.5 text-sm font-medium text-accent-deep transition hover:bg-accent/10"
          >
            <BookImage className="size-4" aria-hidden />
            Start a memory with these {person.photos.length} items
          </Link>
        </div>
      ) : null}

      <FacePrivacyNote compact className="mt-10" />

      <AddPhotosToPersonSheet
        personId={person.id}
        personName={person.displayName}
        excludeMediaIds={person.photos.map((p) => p.id)}
        open={addPhotosOpen}
        onClose={() => setAddPhotosOpen(false)}
        onAssigned={({ person: next, assignedCount, alreadyCount, skippedCount }) => {
          applyPerson(next as SerializedPersonDetail);
          const parts: string[] = [];
          if (assignedCount > 0) {
            parts.push(
              `Added ${assignedCount} item${assignedCount === 1 ? "" : "s"}.`,
            );
          }
          if (alreadyCount > 0) {
            parts.push(
              `${alreadyCount} already on this person.`,
            );
          }
          if (skippedCount > 0) {
            parts.push(`${skippedCount} couldn't be added.`);
          }
          setNotice(parts.join(" ") || "Library updated.");
          setError(null);
          router.refresh();
        }}
      />

      {lightbox && viewerMounted
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-label="Photo preview"
              onClick={() => setLightboxId(null)}
            >
              <button
                type="button"
                className="absolute right-4 top-4 rounded-full bg-canvas/90 p-2 text-ink shadow"
                onClick={() => setLightboxId(null)}
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
              <div
                className="relative max-h-[85vh] max-w-4xl overflow-hidden rounded-xl bg-canvas shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                {lightbox.type === "photo" || lightbox.type === "video" ? (
                  <MediaViewerMedia
                    mediaId={lightbox.id}
                    type={lightbox.type}
                    alt={lightbox.originalFilename || person.displayName}
                  />
                ) : (
                  <div className="flex min-h-64 min-w-80 flex-col items-center justify-center gap-3 p-10 text-ink-muted">
                    Preview unavailable
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 border-t border-ink/8 px-4 py-3">
                  <p className="text-sm text-ink-muted">
                    {person.cover?.faceId === lightbox.faceId
                      ? "Current cover"
                      : "Use this face as cover?"}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        removeMediaFromPerson(
                          lightbox.faceId,
                          lightbox.id,
                          lightbox.type,
                        )
                      }
                      disabled={pending}
                      className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-60"
                    >
                      <UserMinus className="size-3" aria-hidden />
                      Remove from {person.displayName}
                    </button>
                    {person.cover?.faceId !== lightbox.faceId ? (
                      <button
                        type="button"
                        onClick={() => setCover(lightbox.faceId)}
                        disabled={pending}
                        className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent-deep disabled:opacity-60"
                      >
                        <Star className="size-3" aria-hidden />
                        Set cover
                      </button>
                    ) : null}
                  </div>
                </div>
                <FaceLabelEditor
                  mediaId={lightbox.id}
                  people={allPeople}
                  onChanged={() => {
                    setNotice("Face labels updated.");
                    router.refresh();
                  }}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
