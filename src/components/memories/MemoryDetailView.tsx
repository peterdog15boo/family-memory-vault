"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Film,
  ImagePlus,
  Loader2,
  Pencil,
  Shield,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { CreateMoviePanel } from "@/components/memories/CreateMoviePanel";
import { MediaThumb } from "@/components/memories/MediaThumb";
import { MediaIntakePanel } from "@/components/media/MediaIntakePanel";
import { MediaViewerMedia } from "@/components/media/MediaViewerMedia";
import { MediaTagsControl } from "@/components/media/MediaTagsControl";
import { MemoryFamilyShareControls } from "@/components/memories/MemoryFamilyShareControls";
import { SlideshowPlayer } from "@/components/memories/SlideshowPlayer";
import { MovieLibrary } from "@/components/movies/MovieLibrary";
import { useCopy, useFormat, useTranslations } from "@/components/i18n/LocaleProvider";
import { useLightboxKeyboardNav } from "@/hooks/useLightboxKeyboardNav";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import { useAnnounceStatus } from "@/hooks/useAnnounceStatus";
import { announce } from "@/lib/a11y/announce";
import type {
  SerializedMemoryWithMedia,
  SerializedSafeMedia,
} from "@/lib/memories/types";
import type { SerializedMovie } from "@/lib/movies/serialize";
import type { PlanCapabilities } from "@/lib/plans/gates";
import { cn } from "@/lib/utils";

type MemoryDetailViewProps = {
  initialMemory: SerializedMemoryWithMedia;
  /** Clean library items available to add (owner's clean media). */
  library: SerializedSafeMedia[];
  /** Movies generated from this memory (owner only). */
  initialMovies?: SerializedMovie[];
  /** Plan gates for movie creation / themes. */
  planCapabilities: PlanCapabilities;
  /** Title/description edits (owner or family contribute). */
  canEdit: boolean;
  /** Add/remove media and cover (owner only). */
  canManageMedia: boolean;
  /** Family sharing controls (owner only). */
  canManageSharing: boolean;
  /** Viewer belongs to at least one family. */
  hasFamily: boolean;
  /** Open the title/description editor on mount (e.g. from ?edit=1). */
  startEditing?: boolean;
};

type ViewMode = "grid" | "timeline";

export function MemoryDetailView({
  initialMemory,
  library,
  initialMovies = [],
  planCapabilities,
  canEdit,
  canManageMedia,
  canManageSharing,
  hasFamily,
  startEditing = false,
}: MemoryDetailViewProps) {
  const router = useRouter();
  const copy = useCopy();
  const t = useTranslations();
  const format = useFormat();
  const [memory, setMemory] = useState(initialMemory);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [editing, setEditing] = useState(Boolean(canEdit && startEditing));
  const [title, setTitle] = useState(initialMemory.title);
  const [description, setDescription] = useState(
    initialMemory.description ?? "",
  );
  const [addOpen, setAddOpen] = useState(false);
  const [slideshowOpen, setSlideshowOpen] = useState(false);
  const [movieOpen, setMovieOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moviesRefreshKey, setMoviesRefreshKey] = useState(0);
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useAnnounceStatus(notice, { priority: "polite" });
  useAnnounceStatus(error, { priority: "assertive" });
  const [pending, startTransition] = useTransition();
  const [busyMediaId, setBusyMediaId] = useState<string | null>(null);

  useEffect(() => {
    setMemory(initialMemory);
    setTitle(initialMemory.title);
    setDescription(initialMemory.description ?? "");
  }, [initialMemory]);

  const inMemoryIds = useMemo(
    () => new Set(memory.media.map((item) => item.id)),
    [memory.media],
  );

  const addableLibrary = useMemo(
    () => library.filter((item) => !inMemoryIds.has(item.id)),
    [library, inMemoryIds],
  );

  const lightbox = memory.media.find((item) => item.id === lightboxId) ?? null;
  const [viewerMounted, setViewerMounted] = useState(false);
  const lightboxRef = useRef<HTMLDivElement>(null);
  const addSheetRef = useRef<HTMLDivElement>(null);
  const closeLightbox = useCallback(() => setLightboxId(null), []);
  const closeAddSheet = useCallback(() => {
    if (!pending) setAddOpen(false);
  }, [pending]);
  const deleteConfirmRef = useRef<HTMLDivElement>(null);
  const dismissDeleteAlbum = useCallback(() => {
    if (!pending) setDeleteOpen(false);
  }, [pending]);

  useEffect(() => {
    setViewerMounted(true);
  }, []);

  useOverlayA11y({
    open: Boolean(lightbox),
    onClose: closeLightbox,
    containerRef: lightboxRef,
  });

  useOverlayA11y({
    open: Boolean(addOpen && canManageMedia),
    onClose: closeAddSheet,
    containerRef: addSheetRef,
    escapeEnabled: !pending,
  });

  useOverlayA11y({
    open: Boolean(deleteOpen && canManageMedia),
    onClose: dismissDeleteAlbum,
    containerRef: deleteConfirmRef,
    lockScroll: false,
    escapeEnabled: !pending,
    // Inline non-modal confirm — Escape + initial focus only; don't trap Tab.
    trapFocus: false,
    initialFocusSelector: "button",
  });

  const memoryMediaIds = useMemo(
    () => memory.media.map((item) => item.id),
    [memory.media],
  );
  const {
    canNavigate: lightboxCanNav,
    index: lightboxIndex,
    count: lightboxCount,
    goPrev: lightboxPrev,
    goNext: lightboxNext,
  } = useLightboxKeyboardNav({
    open: Boolean(lightbox),
    itemIds: memoryMediaIds,
    activeId: lightboxId,
    onActiveIdChange: setLightboxId,
    enabled: !tagsOpen,
  });

  const refreshFromPayload = useCallback(
    (next: SerializedMemoryWithMedia) => {
      setMemory(next);
      setTitle(next.title);
      setDescription(next.description ?? "");
      // Avoid router.refresh() here — it re-renders the app layout and can
      // trip Clerk currentUser() failures (TLS / API blips) after mutations.
      // Local state already has the updated memory from the API response.
    },
    [],
  );

  async function patchMemory(body: Record<string, unknown>) {
    const response = await fetch(`/api/memories/${memory.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      memory?: SerializedMemoryWithMedia;
    };
    if (!response.ok || !data.memory) {
      throw new Error(data.error || "Could not update memory.");
    }
    refreshFromPayload(data.memory);
  }

  function saveDetails() {
    setError(null);
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Title cannot be empty.");
      return;
    }

    startTransition(async () => {
      try {
        await patchMemory({
          title: trimmed,
          description: description.trim() || null,
        });
        setEditing(false);
        announce(t("a11y.memorySaved"), { priority: "polite" });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Update failed.");
      }
    });
  }

  function setCover(mediaId: string) {
    if (!canManageMedia || mediaId === memory.coverMediaId) return;
    setError(null);
    setBusyMediaId(mediaId);
    startTransition(async () => {
      try {
        await patchMemory({ coverMediaId: mediaId });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not set cover.");
      } finally {
        setBusyMediaId(null);
      }
    });
  }

  function removeMedia(mediaId: string) {
    if (!canManageMedia) return;
    setError(null);
    setBusyMediaId(mediaId);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/memories/${memory.id}/media`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaId }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          memory?: SerializedMemoryWithMedia;
        };
        if (!response.ok || !data.memory) {
          throw new Error(data.error || "Could not remove photos.");
        }
        refreshFromPayload(data.memory);
        if (lightboxId === mediaId) setLightboxId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Remove failed.");
      } finally {
        setBusyMediaId(null);
      }
    });
  }

  function addSelectedMedia() {
    if (!canManageMedia || pickedIds.length === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/memories/${memory.id}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaIds: pickedIds }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          memory?: SerializedMemoryWithMedia;
        };
        if (!response.ok || !data.memory) {
          throw new Error(data.error || "Could not add photos.");
        }
        refreshFromPayload(data.memory);
        setPickedIds([]);
        setAddOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Add failed.");
      }
    });
  }

  function confirmDeleteAlbum() {
    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch(`/api/memories/${memory.id}`, {
          method: "DELETE",
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          ok?: boolean;
        };
        if (!response.ok || !data.ok) {
          throw new Error(data.error || "Could not delete album.");
        }
        announce(t("a11y.memoryDeleted"), { priority: "polite" });
        router.push("/memories?deleted=1");
        router.refresh();
      } catch (err) {
        setDeleteOpen(false);
        setError(err instanceof Error ? err.message : "Delete failed.");
      }
    });
  }

  const updatedLabel = format.date(memory.updatedAt);

  return (
    <div className="app-page mx-auto max-w-6xl">
      <Link
        href="/memories"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All memories
      </Link>

      {/* Hero */}
      <section className="memory-hero relative mt-5 overflow-hidden rounded-2xl border border-ink/8 bg-canvas-deep/60">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          aria-hidden
        >
          {memory.cover?.previewUrl && memory.cover.type === "photo" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={memory.cover.previewUrl}
              alt=""
              className="h-full w-full scale-110 object-cover blur-2xl"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-accent/20 via-canvas-deep to-[color:var(--warm-glow)]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/80 to-canvas/40" />
        </div>

        <div className="relative flex flex-col gap-6 p-5 sm:flex-row sm:items-end sm:gap-8 sm:p-8">
          <div className="memory-hero-cover relative aspect-[4/3] w-full max-w-sm overflow-hidden rounded-xl border border-ink/10 bg-canvas shadow-md sm:w-56 sm:shrink-0">
            {memory.cover ? (
              <MediaThumb item={memory.cover} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-ink/30">
                <ImagePlus className="size-8" aria-hidden />
                <span className="text-xs">No cover yet</span>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 pb-1">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink-muted">
              {memory.type === "story" ? "Story" : "Family album"}
            </p>

            {editing && canEdit ? (
              <div className="mt-2 space-y-3">
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={200}
                  className="w-full rounded-md border border-ink/12 bg-canvas/95 px-3 py-2 font-display text-2xl tracking-tight text-ink outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
                  aria-label="Memory title"
                />
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={5000}
                  rows={3}
                  placeholder="Add a short description…"
                  className="w-full resize-y rounded-md border border-ink/12 bg-canvas/95 px-3 py-2 text-sm text-ink outline-none placeholder:text-ink/35 focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
                  aria-label="Memory description"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={saveDetails}
                    disabled={pending}
                    className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-deep disabled:opacity-60"
                  >
                    {pending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : null}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setTitle(memory.title);
                      setDescription(memory.description ?? "");
                      setError(null);
                    }}
                    className="rounded-md px-3 py-2 text-sm text-ink-muted hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h1 className="page-title mt-1 font-display text-3xl tracking-tight text-ink sm:text-4xl">
                  {memory.title}
                </h1>
                {memory.description ? (
                  <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink-muted">
                    {memory.description}
                  </p>
                ) : canEdit ? (
                  <p className="mt-3 text-sm italic text-ink/40">
                    No description yet
                  </p>
                ) : null}
                <p className="mt-4 text-sm text-ink-muted">
                  {memory.media.length} item
                  {memory.media.length === 1 ? "" : "s"}
                  {" · "}
                  Updated {updatedLabel}
                </p>
              </>
            )}

            {(canEdit || canManageMedia) && !editing ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-2 rounded-md border border-ink/12 bg-canvas/90 px-3 py-2 text-sm font-medium text-ink transition hover:border-accent/35"
                  >
                    <Pencil className="size-3.5" aria-hidden />
                    Edit details
                  </button>
                ) : null}
                {canManageMedia ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPickedIds([]);
                      setAddOpen(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-md border border-ink/12 bg-canvas/90 px-3 py-2 text-sm font-medium text-ink transition hover:border-accent/35"
                  >
                    <ImagePlus className="size-3.5" aria-hidden />
                    Add photos
                  </button>
                ) : null}
                {canManageMedia ? (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setNotice(null);
                      if (memory.media.length === 0) {
                        setError(
                          "Add a few photos to this memory before making a movie.",
                        );
                        return;
                      }
                      setMovieOpen(true);
                    }}
                    className="ui-btn ui-btn-primary"
                  >
                    <Film className="size-3.5" aria-hidden />
                    Make a movie
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setNotice(null);
                    if (memory.media.length === 0) {
                      setError("Add a few photos before playing a slideshow.");
                      return;
                    }
                    setSlideshowOpen(true);
                  }}
                  className="ui-btn ui-btn-secondary"
                >
                  <Clapperboard className="size-3.5" aria-hidden />
                  Play slideshow
                </button>
                {canManageMedia ? (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setNotice(null);
                      setDeleteOpen(true);
                    }}
                    className="ui-btn ui-btn-ghost text-red-800 hover:bg-red-50"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Delete album
                  </button>
                ) : null}
              </div>
            ) : null}

            {!canEdit && !canManageMedia ? (
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setNotice(null);
                    if (memory.media.length === 0) {
                      setError("Add a few photos before playing a slideshow.");
                      return;
                    }
                    setSlideshowOpen(true);
                  }}
                  className="ui-btn ui-btn-primary"
                >
                  <Clapperboard className="size-3.5" aria-hidden />
                  Play slideshow
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="mt-4">
        <MemoryFamilyShareControls
          memory={memory}
          canManage={canManageSharing}
          hasFamily={hasFamily}
          onUpdated={refreshFromPayload}
          onError={setError}
        />
      </div>

      {deleteOpen && canManageMedia ? (
        <div
          ref={deleteConfirmRef}
          className="mt-6 rounded-xl border border-red-200 bg-red-50/60 px-4 py-4 sm:px-5"
          role="dialog"
          aria-modal="false"
          aria-labelledby="delete-album-title"
          tabIndex={-1}
        >
          <p
            id="delete-album-title"
            className="font-display text-lg text-ink"
          >
            Delete this album?
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            Removes{" "}
            <span className="font-medium text-ink">{memory.title}</span> from
            Memories. Your photos stay saved — this only deletes the album and
            any movies made from it. This can&apos;t be undone.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={confirmDeleteAlbum}
              disabled={pending}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-red-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800 disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-3.5" aria-hidden />
              )}
              Delete album
            </button>
            <button
              type="button"
              onClick={dismissDeleteAlbum}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-md border border-ink/10 bg-canvas px-4 py-2.5 text-sm text-ink hover:bg-canvas-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="mt-4 rounded-md border border-accent/25 bg-accent/10 px-3 py-2 text-sm text-accent-deep">
          {notice}
        </p>
      ) : null}

      {/* Media */}
      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl tracking-tight text-ink">
              In this memory
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Hover an item to set the cover or remove it.
            </p>
          </div>
          <div className="inline-flex rounded-md border border-ink/10 bg-canvas p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={cn(
                "rounded px-2.5 py-1.5 transition",
                viewMode === "grid"
                  ? "bg-accent/15 font-medium text-accent-deep"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              Grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode("timeline")}
              className={cn(
                "rounded px-2.5 py-1.5 transition",
                viewMode === "timeline"
                  ? "bg-accent/15 font-medium text-accent-deep"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              Timeline
            </button>
          </div>
        </div>

        {memory.media.length === 0 ? (
          <div className="ui-empty rounded-xl border border-dashed border-ink/15 bg-canvas-deep/40 px-6 py-14 text-center">
            <span className="ui-empty-icon mx-auto inline-flex">
              <ImagePlus className="size-8 text-ink/30" aria-hidden />
            </span>
            <p className="ui-empty-title mt-3 font-display text-lg text-ink">
              This memory is waiting for photos
            </p>
            <p className="ui-empty-copy mx-auto mt-2 max-w-sm text-sm text-ink-muted">
              Add a few photos, then you can play a slideshow or make a movie.
            </p>
            {canManageMedia ? (
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="ui-btn ui-btn-primary mt-5"
              >
                Add photos
              </button>
            ) : null}
          </div>
        ) : viewMode === "grid" ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {memory.media.map((item) => (
              <MemoryMediaTile
                key={item.id}
                item={item}
                isCover={item.id === memory.coverMediaId}
                canEdit={canManageMedia}
                busy={pending && busyMediaId === item.id}
                onOpen={() => setLightboxId(item.id)}
                onSetCover={() => setCover(item.id)}
                onRemove={() => removeMedia(item.id)}
              />
            ))}
          </ul>
        ) : (
          <ol className="space-y-4">
            {memory.media.map((item, index) => (
              <li
                key={item.id}
                className="list-card memory-timeline-row flex gap-4 rounded-xl border border-ink/8 bg-canvas/80 p-3 sm:p-4"
              >
                <div className="hidden w-10 shrink-0 flex-col items-center pt-1 sm:flex">
                  <span className="text-xs font-medium text-ink-muted">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="mt-2 w-px flex-1 bg-ink/10" aria-hidden />
                </div>
                <button
                  type="button"
                  onClick={() => setLightboxId(item.id)}
                  className="media-tile relative aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-lg border border-ink/8 bg-canvas-deep sm:w-40"
                >
                  <MediaThumb item={item} />
                </button>
                <div className="min-w-0 flex-1 py-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {item.originalFilename || "Family photo"}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {item.type === "video" ? "Video" : "Photo"}
                    {item.id === memory.coverMediaId ? " · Cover" : ""}
                    {" · "}
                    Added {format.date(item.addedAt, { month: "short", day: "numeric" })}
                  </p>
                  {canManageMedia ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setCover(item.id)}
                        disabled={pending || item.id === memory.coverMediaId}
                        className="inline-flex items-center gap-1 rounded-md border border-ink/10 px-2 py-1 text-xs text-ink-muted hover:text-ink disabled:opacity-50"
                      >
                        <Star
                          className={cn(
                            "size-3",
                            item.id === memory.coverMediaId && "fill-current text-accent",
                          )}
                          aria-hidden
                        />
                        {item.id === memory.coverMediaId
                          ? "Cover"
                          : "Set cover"}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeMedia(item.id)}
                        disabled={pending}
                        className="inline-flex items-center gap-1 rounded-md border border-ink/10 px-2 py-1 text-xs text-ink-muted hover:text-red-700 disabled:opacity-50"
                      >
                        <Trash2 className="size-3" aria-hidden />
                        Remove
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="mt-8 flex gap-2 text-xs text-ink-muted">
        <Shield className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
        This album shows photos that are ready to share. Share with family when
        you&apos;re ready.
      </p>

      {canManageMedia ? (
        <section className="mt-12">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-xl tracking-tight text-ink">
                Movies
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                Short films from this memory.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setError(null);
                if (memory.media.length === 0) {
                  setError(
                    "Add a few photos to this memory before making a movie.",
                  );
                  return;
                }
                setMovieOpen(true);
              }}
              className="ui-btn ui-btn-secondary"
            >
              <Film className="size-3.5" aria-hidden />
              Make a movie
            </button>
          </div>
          <MovieLibrary
            initialMovies={initialMovies}
            memoryId={memory.id}
            refreshKey={moviesRefreshKey}
            emptyTitle={copy.empty.moviesMemory.title}
            emptyDescription={copy.empty.moviesMemory.description}
            emptyActionHref="/memories"
            emptyActionLabel={t("pages.browseOtherMemories")}
          />
        </section>
      ) : null}

      {/* Add photos sheet */}
      {addOpen && canManageMedia ? (
        <div
          ref={addSheetRef}
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-photos-memory-title"
          tabIndex={-1}
          onClick={() => !pending && setAddOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl border border-ink/10 bg-canvas shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-ink/8 px-4 py-3">
              <div>
                <h3
                  id="add-photos-memory-title"
                  className="font-display text-lg text-ink"
                >
                  Add photos
                </h3>
                <p className="text-xs text-ink-muted">
                  Choose from photos that are ready
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="rounded-md p-2 text-ink-muted hover:bg-ink/5 hover:text-ink"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="max-h-[55vh] overflow-y-auto p-4 space-y-4">
              <MediaIntakePanel
                memoryId={memory.id}
                defaultAttachToMemory
                showAttachToggle
                onMediaReady={() => {
                  router.refresh();
                }}
              />

              <div className="border-t border-ink/8 pt-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Or choose from your library
                </p>
              {addableLibrary.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-muted">
                  No more ready photos to add right now. Upload above and they
                  will appear here after the safety check.
                </p>
              ) : (
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {addableLibrary.map((item) => {
                    const selected = pickedIds.includes(item.id);
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setPickedIds((prev) =>
                              prev.includes(item.id)
                                ? prev.filter((id) => id !== item.id)
                                : [...prev, item.id],
                            )
                          }
                          aria-pressed={selected}
                          className={cn(
                            "relative aspect-square w-full overflow-hidden rounded-lg border",
                            selected
                              ? "border-accent ring-2 ring-accent/35"
                              : "border-ink/10",
                          )}
                        >
                          <MediaThumb item={item} />
                          <span
                            className={cn(
                              "absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full border",
                              selected
                                ? "border-accent bg-accent text-accent-foreground"
                                : "border-ink/20 bg-canvas/80 text-transparent",
                            )}
                          >
                            <Check className="size-3" aria-hidden />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-ink/8 px-4 py-3">
              <p className="text-xs text-ink-muted">
                {pickedIds.length} selected
              </p>
              <button
                type="button"
                disabled={pending || pickedIds.length === 0}
                onClick={addSelectedMedia}
                className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-deep disabled:opacity-60"
              >
                {pending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                Add to memory
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Lightbox — portal to body so page transforms don't trap position:fixed */}
      {lightbox && viewerMounted
        ? createPortal(
            <div
              ref={lightboxRef}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-labelledby="memory-lightbox-title"
              tabIndex={-1}
              onClick={() => setLightboxId(null)}
            >
              <button
                type="button"
                onClick={() => setLightboxId(null)}
                className="absolute right-4 top-4 z-10 rounded-md bg-canvas/90 p-2 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                aria-label="Close"
              >
                <X className="size-5" aria-hidden />
              </button>
              {lightboxCanNav ? (
                <>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      lightboxPrev();
                    }}
                    className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-md bg-canvas/90 p-2 text-ink shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:left-4"
                    aria-label="Previous"
                  >
                    <ChevronLeft className="size-5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      lightboxNext();
                    }}
                    className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-md bg-canvas/90 p-2 text-ink shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:right-4"
                    aria-label="Next"
                  >
                    <ChevronRight className="size-5" aria-hidden />
                  </button>
                </>
              ) : null}
              <div
                className="relative flex max-h-[85vh] max-w-5xl flex-col overflow-hidden rounded-xl bg-canvas shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <p id="memory-lightbox-title" className="sr-only">
                  {lightbox.originalFilename ||
                    (lightbox.type === "video"
                      ? "Video preview"
                      : "Photo preview")}
                  {lightboxCanNav
                    ? ` (${lightboxIndex + 1} of ${lightboxCount})`
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
                    alt={lightbox.originalFilename || "Family photo"}
                  />
                ) : (
                  <div className="flex min-h-64 min-w-80 items-center justify-center p-10 text-ink-muted">
                    Preview unavailable
                  </div>
                )}
                {lightbox.type === "photo" || lightbox.type === "video" ? (
                  <div className="flex items-center justify-end gap-2 border-t border-ink/8 px-4 py-3">
                    <MediaTagsControl
                      mediaId={lightbox.id}
                      compact
                      canNavigate={lightboxCanNav}
                      onPrev={lightboxPrev}
                      onNext={lightboxNext}
                      onOpenChange={setTagsOpen}
                    />
                  </div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}

      {slideshowOpen ? (
        <SlideshowPlayer
          memory={memory}
          canEdit={canEdit}
          onClose={() => setSlideshowOpen(false)}
          onSettingsSaved={(next) => refreshFromPayload(next)}
        />
      ) : null}

      {movieOpen && canManageMedia ? (
        <CreateMoviePanel
          memoryId={memory.id}
          memoryTitle={memory.title}
          mediaCount={memory.media.length}
          capabilities={planCapabilities}
          onClose={() => {
            setMovieOpen(false);
            setMoviesRefreshKey((key) => key + 1);
          }}
        />
      ) : null}
    </div>
  );
}

function MemoryMediaTile({
  item,
  isCover,
  canEdit,
  busy,
  onOpen,
  onSetCover,
  onRemove,
}: {
  item: SerializedMemoryWithMedia["media"][number];
  isCover: boolean;
  canEdit: boolean;
  busy: boolean;
  onOpen: () => void;
  onSetCover: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="group relative">
      <div className="media-tile relative aspect-square overflow-hidden rounded-lg border border-ink/10 bg-canvas-deep">
        <button
          type="button"
          onClick={onOpen}
          aria-label={
            item.type === "video"
              ? `Open video: ${item.originalFilename || "Family video"}`
              : `Open photo: ${item.originalFilename || "Family photo"}`
          }
          className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40"
        >
          <MediaThumb item={item} />
        </button>

        {isCover ? (
          <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground shadow-sm">
            <Star className="size-2.5 fill-current" aria-hidden />
            Cover
          </span>
        ) : null}

        {canEdit ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-ink/55 to-transparent p-2 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
            <button
              type="button"
              onClick={onSetCover}
              disabled={busy || isCover}
              className="inline-flex items-center gap-1 rounded-md bg-canvas/95 px-2 py-1 text-[11px] font-medium text-ink shadow-sm disabled:opacity-50"
              aria-label={isCover ? "Current cover" : "Set as cover"}
            >
              <Star
                className={cn("size-3", isCover && "fill-current text-accent")}
                aria-hidden
              />
              Cover
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md bg-canvas/95 px-2 py-1 text-[11px] font-medium text-ink shadow-sm hover:text-red-700 disabled:opacity-50"
              aria-label="Remove from memory"
            >
              <Trash2 className="size-3" aria-hidden />
            </button>
          </div>
        ) : null}

        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center bg-canvas/50">
            <Loader2 className="size-5 animate-spin text-accent" aria-hidden />
          </div>
        ) : null}
      </div>
    </li>
  );
}
