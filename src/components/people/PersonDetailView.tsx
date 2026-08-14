"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  BookImage,
  Check,
  ChevronLeft,
  ChevronRight,
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
import { MediaTagsControl } from "@/components/media/MediaTagsControl";
import { useFormat, useTranslations } from "@/components/i18n/LocaleProvider";
import { useLightboxKeyboardNav } from "@/hooks/useLightboxKeyboardNav";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import type { Formatters, TranslateFn } from "@/lib/i18n";
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

function mediaLabel(t: TranslateFn, count: number) {
  return count === 1
    ? t("people.itemCount", { count })
    : t("people.itemCountPlural", { count });
}

function gallerySectionTitle(t: TranslateFn, photos: { type?: string }[]) {
  const hasPhoto = photos.some((p) => p.type === "photo");
  const hasVideo = photos.some((p) => p.type === "video");
  if (hasPhoto && hasVideo) return t("people.photosAndVideos");
  if (hasVideo) return t("people.videos");
  return t("people.photos");
}

function formatDateRange(
  format: Formatters,
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
    return format.date(from, opts);
  }
  const sameYear = from.getFullYear() === to.getFullYear();
  if (sameYear) {
    return `${format.date(from, {
      month: "short",
      day: "numeric",
    })} – ${format.date(to, opts)}`;
  }
  return `${format.date(from, opts)} – ${format.date(to, opts)}`;
}

export function PersonDetailView({
  initialPerson,
  mergeCandidates,
  allPeople,
}: PersonDetailViewProps) {
  const router = useRouter();
  const format = useFormat();
  const t = useTranslations();
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
  const lightboxRef = useRef<HTMLDivElement>(null);
  const closeLightbox = useCallback(() => setLightboxId(null), []);

  useEffect(() => {
    setViewerMounted(true);
  }, []);

  useOverlayA11y({
    open: Boolean(lightbox),
    onClose: closeLightbox,
    containerRef: lightboxRef,
  });

  const personPhotoIds = useMemo(
    () => person.photos.map((p) => p.id),
    [person.photos],
  );
  const {
    canNavigate: lightboxCanNav,
    index: lightboxIndex,
    count: lightboxCount,
    goPrev: lightboxPrev,
    goNext: lightboxNext,
  } = useLightboxKeyboardNav({
    open: Boolean(lightbox),
    itemIds: personPhotoIds,
    activeId: lightboxId,
    onActiveIdChange: setLightboxId,
  });

  const dateRange = formatDateRange(
    format,
    person.photoDateFrom,
    person.photoDateTo,
  );
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
      throw new Error(data.error || t("people.errorUpdate"));
    }
    applyPerson(data.person);
    return data.person;
  }

  function saveName() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("people.errorNameEmpty"));
      return;
    }

    startTransition(async () => {
      try {
        await patchPerson({ name: trimmed });
        setEditing(false);
        setNotice(t("people.nameSaved"));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("people.errorRename"));
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
        setNotice(t("people.coverUpdated"));
      } catch (err) {
        setError(err instanceof Error ? err.message : t("people.errorSetCover"));
      } finally {
        setBusyFaceId(null);
      }
    });
  }

  function removeMediaFromPerson(faceId: string, mediaId: string, mediaType?: string) {
    setError(null);
    setNotice(null);
    setBusyFaceId(faceId);
    const isVideo = mediaType === "video";
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
          throw new Error(
            data.error ||
              (isVideo ? t("people.errorRemoveVideo") : t("people.errorRemovePhoto")),
          );
        }
        setPerson((prev) => ({
          ...prev,
          photos: prev.photos.filter((p) => p.faceId !== faceId),
          photoCount: Math.max(0, prev.photoCount - 1),
          cover: prev.cover?.faceId === faceId ? null : prev.cover,
        }));
        if (lightboxId === mediaId) setLightboxId(null);
        setNotice(isVideo ? t("people.videoRemoved") : t("people.photoRemoved"));
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : isVideo
              ? t("people.errorRemoveVideo")
              : t("people.errorRemovePhoto"),
        );
      } finally {
        setBusyFaceId(null);
      }
    });
  }

  function confirmMerge() {
    if (!targetPersonId) {
      setError(t("people.errorChooseMergeTarget"));
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
          throw new Error(data.error || t("people.errorMerge"));
        }
        setMergeOpen(false);
        setTargetPersonId("");
        setCandidates((prev) => prev.filter((c) => c.id !== sourceId));
        setNotice(
          target
            ? t("people.mergedInto", { name: target.displayName })
            : t("people.peopleMerged"),
        );
        router.replace(`/people/${data.person.id}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("people.errorMergeFailed"));
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
          throw new Error(data.error || t("people.errorDelete"));
        }
        router.replace("/people");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("people.errorDeleteFailed"));
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
        {t("people.allPeople")}
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
              <label htmlFor="person-rename" className="sr-only">
                {t("people.nameLabel")}
              </label>
              <input
                id="person-rename"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("people.namePlaceholder")}
                maxLength={120}
                autoFocus
                required
                aria-required="true"
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
                  {t("common.save")}
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
                  {t("common.cancel")}
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
                  {t("people.rename")}
                </button>
              </div>
              <p className="text-sm text-ink-muted">
                {mediaLabel(t, person.photoCount)}
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
              {t("memories.createMemory")}
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
              aria-expanded={mergeOpen}
              aria-controls="person-merge-panel"
              className={cn(
                "inline-flex items-center gap-2 rounded-md border border-ink/10 bg-canvas px-3 py-2 text-sm font-medium text-ink transition hover:border-accent/35 hover:bg-canvas-deep",
                candidates.length === 0 && "cursor-not-allowed opacity-50",
              )}
            >
              <GitMerge className="size-3.5" aria-hidden />
              {t("people.mergePeople")}
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteOpen((open) => !open);
                setMergeOpen(false);
                setError(null);
                setNotice(null);
              }}
              aria-expanded={deleteOpen}
              aria-controls="person-delete-panel"
              className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50/80 px-3 py-2 text-sm font-medium text-red-800 transition hover:bg-red-100"
            >
              <Trash2 className="size-3.5" aria-hidden />
              {t("common.delete")}
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
            setNotice(t("people.avatarFramingSaved"));
            setError(null);
          }}
          onError={(message) => {
            setError(message);
            setNotice(null);
          }}
        />
      ) : null}

      {mergeOpen ? (
        <div
          id="person-merge-panel"
          className="mt-6 rounded-xl border border-ink/10 bg-canvas-deep/40 px-4 py-4 sm:px-5"
          role="region"
          aria-labelledby="person-merge-title"
        >
          <p id="person-merge-title" className="font-display text-lg text-ink">
            {t("people.mergeIntoTitle")}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            {t("people.mergeIntoBody", { name: person.displayName })}
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 text-left text-sm text-ink">
              <span className="mb-1.5 block text-xs font-medium text-ink-muted">
                {t("people.mergeIntoLabel")}
              </span>
              <select
                value={targetPersonId}
                onChange={(e) => setTargetPersonId(e.target.value)}
                className="w-full rounded-md border border-ink/15 bg-canvas px-3 py-2 text-sm outline-none ring-accent/30 focus:ring-2"
              >
                <option value="">{t("people.mergeSelectKeeper")}</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName} ({mediaLabel(t, c.photoCount)})
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
              {t("people.confirmMerge")}
            </button>
          </div>
        </div>
      ) : null}

      {deleteOpen ? (
        <div
          id="person-delete-panel"
          className="mt-6 rounded-xl border border-red-200 bg-red-50/60 px-4 py-4 sm:px-5"
          role="region"
          aria-labelledby="person-delete-title"
        >
          <p id="person-delete-title" className="font-display text-lg text-ink">
            {t("people.deletePersonTitle")}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            {t("people.deletePersonBody", { name: person.displayName })}
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
              {t("people.deletePerson")}
            </button>
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-md border border-ink/10 bg-canvas px-4 py-2.5 text-sm text-ink hover:bg-canvas-deep disabled:opacity-60"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
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
              {gallerySectionTitle(t, person.photos)}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {t("people.galleryLead")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {person.photos.length > 0 ? (
              <p className="text-xs text-ink-muted">
                {mediaLabel(t, person.photos.length)}
                {dateRange ? ` · ${dateRange}` : ""}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setAddPhotosOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-ink/10 bg-canvas px-3 py-1.5 text-sm font-medium text-ink transition hover:border-accent/40 hover:bg-canvas-deep"
            >
              <ImagePlus className="size-3.5" aria-hidden />
              {t("people.addPhotosVideos")}
            </button>
          </div>
        </div>

        {person.photos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink/15 bg-canvas-deep/30 px-6 py-12 text-center">
            <p className="font-display text-lg text-ink">
              {t("people.emptyMediaTitle")}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">
              {t("people.emptyMediaBody")}
            </p>
            <button
              type="button"
              onClick={() => setAddPhotosOpen(true)}
              className="ui-btn ui-btn-primary mt-5"
            >
              <ImagePlus className="size-4" aria-hidden />
              {t("people.addPhotosVideos")}
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
                      className="absolute inset-0 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
                      aria-label={
                        photo.type === "video"
                          ? t("people.viewVideoOf", { name: person.displayName })
                          : t("people.viewPhotoOf", { name: person.displayName })
                      }
                    >
                      <MediaThumb
                        item={photo}
                        alt={t("people.photoAlt", { name: person.displayName })}
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
                        isCover
                          ? t("people.currentCoverFace")
                          : t("people.setAsCoverFace")
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
                      {isCover ? t("memories.cover") : t("people.setCover")}
                    </button>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeMediaFromPerson(photo.faceId, photo.id, photo.type);
                      }}
                      disabled={pending && busyFaceId === photo.faceId}
                      className="absolute bottom-2 left-2 z-10 inline-flex items-center gap-1 rounded-md bg-canvas/90 px-2 py-1 text-[11px] font-medium text-ink-muted shadow-sm backdrop-blur-sm transition opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-red-50 hover:text-red-800"
                      aria-label={
                        photo.type === "video"
                          ? t("people.removeVideoFrom", {
                              name: person.displayName,
                            })
                          : t("people.removePhotoFrom", {
                              name: person.displayName,
                            })
                      }
                    >
                      {pending && busyFaceId === photo.faceId ? (
                        <Loader2 className="size-3 animate-spin" aria-hidden />
                      ) : (
                        <UserMinus className="size-3" aria-hidden />
                      )}
                      {t("common.remove")}
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
            {t("people.startMemoryWithItems", { count: person.photos.length })}
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
              assignedCount === 1
                ? t("people.addedItems", { count: assignedCount })
                : t("people.addedItemsPlural", { count: assignedCount }),
            );
          }
          if (alreadyCount > 0) {
            parts.push(t("people.alreadyOnPerson", { count: alreadyCount }));
          }
          if (skippedCount > 0) {
            parts.push(t("people.couldntAdd", { count: skippedCount }));
          }
          setNotice(parts.join(" ") || t("people.libraryUpdated"));
          setError(null);
          router.refresh();
        }}
      />

      {lightbox && viewerMounted
        ? createPortal(
            <div
              ref={lightboxRef}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-labelledby="person-lightbox-title"
              tabIndex={-1}
              onClick={() => setLightboxId(null)}
            >
              <button
                type="button"
                className="absolute right-4 top-4 z-10 rounded-full bg-canvas/90 p-2 text-ink shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                onClick={() => setLightboxId(null)}
                aria-label={t("common.close")}
              >
                <X className="size-4" aria-hidden />
              </button>
              {lightboxCanNav ? (
                <>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      lightboxPrev();
                    }}
                    className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-canvas/90 p-2 text-ink shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:left-4"
                    aria-label={t("common.previous")}
                  >
                    <ChevronLeft className="size-5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      lightboxNext();
                    }}
                    className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full bg-canvas/90 p-2 text-ink shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:right-4"
                    aria-label={t("common.next")}
                  >
                    <ChevronRight className="size-5" aria-hidden />
                  </button>
                </>
              ) : null}
              <div
                className="relative max-h-[85vh] max-w-4xl overflow-hidden rounded-xl bg-canvas shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <p id="person-lightbox-title" className="sr-only">
                  {lightbox.originalFilename ||
                    (lightbox.type === "video"
                      ? t("people.videoOf", { name: person.displayName })
                      : t("people.photoOf", { name: person.displayName }))}
                  {lightboxCanNav
                    ? ` ${t("people.ofCount", {
                        index: lightboxIndex + 1,
                        count: lightboxCount,
                      })}`
                    : ""}
                </p>
                {lightboxCanNav ? (
                  <p className="sr-only" aria-live="polite">
                    {lightboxIndex + 1} of {lightboxCount}
                  </p>
                ) : null}
                {lightbox.type === "photo" || lightbox.type === "video" ? (
                  <MediaViewerMedia
                    mediaId={lightbox.id}
                    type={lightbox.type}
                    alt={lightbox.originalFilename || person.displayName}
                  />
                ) : (
                  <div className="flex min-h-64 min-w-80 flex-col items-center justify-center gap-3 p-10 text-ink-muted">
                    {t("people.previewUnavailable")}
                  </div>
                )}
                <div className="flex flex-col gap-3 border-t border-ink/8 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-ink-muted">
                    {person.cover?.faceId === lightbox.faceId
                      ? t("memories.currentCover")
                      : t("people.useFaceAsCover")}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <MediaTagsControl mediaId={lightbox.id} compact />
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
                      {t("people.removeFromPerson", {
                        name: person.displayName,
                      })}
                    </button>
                    {person.cover?.faceId !== lightbox.faceId ? (
                      <button
                        type="button"
                        onClick={() => setCover(lightbox.faceId)}
                        disabled={pending}
                        className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent-deep disabled:opacity-60"
                      >
                        <Star className="size-3" aria-hidden />
                        {t("people.setCover")}
                      </button>
                    ) : null}
                  </div>
                </div>
                <FaceLabelEditor
                  mediaId={lightbox.id}
                  people={allPeople}
                  onChanged={() => {
                    setNotice(t("people.faceLabelsUpdated"));
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
