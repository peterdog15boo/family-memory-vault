"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Film, ImageIcon, Trash2, Upload, X } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { MediaThumb } from "@/components/memories/MediaThumb";
import { MediaViewerMedia } from "@/components/media/MediaViewerMedia";
import { AssignMediaToPersonControl } from "@/components/people/AssignMediaToPersonControl";
import { MediaTagsControl } from "@/components/media/MediaTagsControl";
import { MediaCaptionEditor } from "@/components/media/MediaCaptionEditor";
import { useCopy, useTranslations } from "@/components/i18n/LocaleProvider";
import { useLightboxKeyboardNav } from "@/hooks/useLightboxKeyboardNav";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import { announce } from "@/lib/a11y/announce";
import { cn } from "@/lib/utils";
import type { SerializedSafeMedia } from "@/lib/memories/types";

type GalleryItem = SerializedSafeMedia & {
  /** RSC may still pass Date before JSON boundaries. */
  createdAt: string | Date;
};

type MediaGalleryProps = {
  items: GalleryItem[];
  emptyTitle?: string;
  emptyDescription?: string;
  /** Show Upload CTA on empty (default true when using default copy). */
  emptyActionHref?: string | null;
  emptyActionLabel?: string;
  /** Secondary text link on empty (e.g. Digitize). */
  emptySecondaryAction?: {
    href: string;
    label: string;
  } | null;
  /** Owner-only delete from the preview lightbox. */
  onDelete?: (item: GalleryItem) => void | Promise<void>;
  deletingId?: string | null;
  /**
   * Photos tag mode: click selects a photo for batch tagging (no lightbox).
   * When set, `activeId` is highlighted in the grid.
   */
  tagMode?: {
    activeId: string | null;
    onSelect: (id: string) => void;
  } | null;
};

/** Above shell chrome / notification panel so the viewer covers the viewport. */
const MEDIA_VIEWER_Z = 100;

/**
 * Video grid tile fallback when no JPEG thumbnail exists yet.
 */
const VideoThumbnail = memo(function VideoThumbnail({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-ink/5">
        <Film className="size-7 text-ink/25" aria-hidden />
        <span className="sr-only">{alt}</span>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-ink/5">
      <video
        src={src}
        muted
        playsInline
        preload="metadata"
        onLoadedData={(event) => {
          const video = event.currentTarget;
          try {
            if (video.duration && Number.isFinite(video.duration)) {
              // Avoid black / fade-in intro frames (match server poster seek).
              video.currentTime = Math.min(
                Math.max(2, video.duration * 0.5),
                Math.max(0.25, video.duration - 0.1),
              );
            }
          } catch {
            // ignore
          }
        }}
        onError={() => setFailed(true)}
        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
        aria-label={alt}
      />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink/25">
        <span className="rounded-full bg-ink/55 p-2.5 text-accent-foreground shadow-sm backdrop-blur-[2px]">
          <Film className="size-5" aria-hidden />
        </span>
      </span>
    </div>
  );
});

const GalleryTile = memo(function GalleryTile({
  item,
  onOpen,
  tagModeActive,
  tagModeEnabled,
}: {
  item: GalleryItem;
  onOpen: (id: string) => void;
  tagModeActive?: boolean;
  tagModeEnabled?: boolean;
}) {
  const t = useTranslations();
  const label = item.originalFilename || t("mediaUi.familyMedia");
  const caption = item.caption?.trim() || null;

  return (
    <li className="min-w-0">
      <button
        type="button"
        data-media-id={item.id}
        onClick={() => onOpen(item.id)}
        aria-label={
          tagModeEnabled
            ? t("mediaUi.tagModeSelectPhoto", { name: label })
            : item.type === "video"
              ? `Open video: ${label}`
              : `Open photo: ${label}`
        }
        aria-current={tagModeActive ? "true" : undefined}
        className={cn(
          "media-tile group relative aspect-square w-full overflow-hidden rounded-lg",
          "border bg-canvas-deep text-left transition",
          tagModeActive
            ? "border-accent ring-2 ring-accent ring-offset-2 ring-offset-canvas"
            : "border-ink/8 hover:border-accent/40 hover:shadow-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
        )}
      >
        {item.previewUrl && (item.type === "photo" || item.hasThumbnail) ? (
          <div className="h-full w-full transition duration-300 group-hover:scale-[1.03]">
            <MediaThumb item={item} alt={label} />
          </div>
        ) : item.previewUrl && item.type === "video" ? (
          <VideoThumbnail
            src={item.previewUrl}
            alt={item.originalFilename || t("mediaUi.familyMedia")}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
            <div className="ui-skeleton absolute inset-0" />
            {item.type === "video" ? (
              <Film className="relative size-7 text-ink/25" aria-hidden />
            ) : (
              <ImageIcon className="relative size-7 text-ink/25" aria-hidden />
            )}
            <span className="relative text-xs text-ink-muted">
              {item.hasThumbnail
                ? t("mediaUi.loadingPreview")
                : t("mediaUi.almostReady")}
            </span>
          </div>
        )}
        {tagModeActive ? (
          <span className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-accent/80 to-transparent px-2 pb-6 pt-2 text-[11px] font-medium text-accent-foreground">
            {t("mediaUi.tagModeActiveBadge")}
          </span>
        ) : (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/50 to-transparent px-2 pb-2 pt-8 text-[11px] text-accent-foreground opacity-0 transition group-hover:opacity-100">
            <span className="line-clamp-1">
              {item.originalFilename || t("nav.memories")}
            </span>
          </span>
        )}
      </button>
      {caption ? (
        <p className="mt-1.5 line-clamp-2 px-0.5 text-xs leading-snug text-ink-muted">
          {caption}
        </p>
      ) : null}
    </li>
  );
});

export function MediaGallery({
  items,
  emptyTitle,
  emptyDescription,
  emptyActionHref = "/upload",
  emptyActionLabel,
  emptySecondaryAction,
  onDelete,
  deletingId = null,
  tagMode = null,
}: MediaGalleryProps) {
  const copy = useCopy();
  const t = useTranslations();
  const resolvedEmptyTitle = emptyTitle ?? copy.empty.mediaOwn.title;
  const resolvedEmptyDescription =
    emptyDescription ?? copy.empty.mediaOwn.description;
  const resolvedEmptyActionLabel = emptyActionLabel ?? t("pages.uploadPhotos");
  const resolvedSecondaryAction =
    emptySecondaryAction === undefined
      ? {
          href: "/family-memory-box",
          label: t("pages.digitizeOld"),
        }
      : emptySecondaryAction;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [captionEditing, setCaptionEditing] = useState(false);
  const [captionOverrides, setCaptionOverrides] = useState<
    Record<string, string | null>
  >({});
  const viewerRef = useRef<HTMLDivElement>(null);
  const tagModeEnabled = Boolean(tagMode);

  const displayItems = useMemo(
    () =>
      items.map((item) =>
        Object.prototype.hasOwnProperty.call(captionOverrides, item.id)
          ? { ...item, caption: captionOverrides[item.id]! }
          : item.caption === undefined
            ? { ...item, caption: null }
            : item,
      ),
    [items, captionOverrides],
  );

  const active = displayItems.find((item) => item.id === activeId) ?? null;
  const deleting = Boolean(active && deletingId === active.id);

  const open = useCallback(
    (id: string) => {
      if (tagMode) {
        tagMode.onSelect(id);
        return;
      }
      setActiveId(id);
    },
    [tagMode],
  );
  const close = useCallback(() => {
    setActiveId(null);
    setCaptionEditing(false);
    announce(t("a11y.viewerClosed"), { priority: "polite" });
  }, [t]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Leave lightbox when entering tag mode.
  useEffect(() => {
    if (tagModeEnabled) setActiveId(null);
  }, [tagModeEnabled]);

  const itemIds = useMemo(() => displayItems.map((item) => item.id), [displayItems]);

  const handleCaptionChange = useCallback(
    (mediaId: string, caption: string | null) => {
      setCaptionOverrides((prev) => ({ ...prev, [mediaId]: caption }));
    },
    [],
  );

  // Announce viewer open / photo change (skip close — handled in close()).
  const viewerAnnounceRef = useRef<string | null>(null);
  useEffect(() => {
    if (tagModeEnabled) return;
    if (!activeId) {
      viewerAnnounceRef.current = null;
      return;
    }
    if (viewerAnnounceRef.current === activeId) return;
    const isOpen = viewerAnnounceRef.current === null;
    viewerAnnounceRef.current = activeId;
    const idx = itemIds.indexOf(activeId);
    if (isOpen) {
      if (idx >= 0 && itemIds.length > 1) {
        announce(
          `${t("a11y.viewerOpened")}. ${t("a11y.viewerPhoto", {
            index: idx + 1,
            count: itemIds.length,
          })}`,
          { priority: "polite" },
        );
      } else {
        announce(t("a11y.viewerOpened"), { priority: "polite" });
      }
    } else if (idx >= 0 && itemIds.length > 1) {
      announce(
        t("a11y.viewerPhoto", { index: idx + 1, count: itemIds.length }),
        { priority: "polite" },
      );
    }
  }, [activeId, itemIds, t, tagModeEnabled]);

  const handleDelete = useCallback(async () => {
    if (!active || !onDelete || deleting) return;
    const label = active.originalFilename || t("common.thisPhoto");
    const ok = window.confirm(
      t("common.deleteConfirmPhoto", { name: label }),
    );
    if (!ok) return;
    await onDelete(active);
  }, [active, deleting, onDelete, t]);

  useOverlayA11y({
    open: Boolean(active) && !tagModeEnabled,
    onClose: close,
    containerRef: viewerRef,
    lockScrollPadding: true,
    // Caption editor owns Esc while editing.
    escapeEnabled: !captionEditing && !tagsOpen,
  });

  const { canNavigate, index, count, goPrev, goNext } = useLightboxKeyboardNav({
    open: Boolean(active) && !tagModeEnabled,
    itemIds,
    activeId,
    onActiveIdChange: setActiveId,
    enabled: !tagsOpen && !captionEditing,
  });

  // Close the lightbox if the active item was removed from the list.
  useEffect(() => {
    if (activeId && !items.some((item) => item.id === activeId)) {
      setActiveId(null);
    }
  }, [activeId, items]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ImageIcon}
        title={resolvedEmptyTitle}
        description={resolvedEmptyDescription}
        action={
          emptyActionHref
            ? {
                href: emptyActionHref,
                label: resolvedEmptyActionLabel,
                icon: Upload,
              }
            : undefined
        }
        secondaryAction={resolvedSecondaryAction ?? undefined}
        size="large"
      />
    );
  }

  const viewer =
    active && mounted && !tagModeEnabled
      ? createPortal(
          <div
            ref={viewerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="media-viewer-title"
            className="fixed inset-0 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm"
            style={{ zIndex: MEDIA_VIEWER_Z }}
            tabIndex={-1}
            onClick={close}
          >
            <button
              type="button"
              onClick={close}
              className="ui-btn ui-btn-secondary absolute right-4 top-4 z-10"
              aria-label={t("common.close")}
            >
              <X className="size-5" aria-hidden />
            </button>

            {canNavigate ? (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    goPrev();
                  }}
                  className="ui-btn ui-btn-secondary absolute left-3 top-1/2 z-10 -translate-y-1/2 sm:left-4"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="size-5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    goNext();
                  }}
                  className="ui-btn ui-btn-secondary absolute right-3 top-1/2 z-10 -translate-y-1/2 sm:right-4"
                  aria-label="Next photo"
                >
                  <ChevronRight className="size-5" aria-hidden />
                </button>
              </>
            ) : null}

            <div
              className="relative flex max-h-[min(85vh,100%)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-ink/10 bg-canvas shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              {active.type === "photo" || active.type === "video" ? (
                <MediaViewerMedia
                  mediaId={active.id}
                  type={active.type}
                  alt={active.originalFilename || "Family photo"}
                />
              ) : (
                <div className="flex min-h-64 min-w-80 flex-col items-center justify-center gap-3 p-10 text-ink-muted">
                  <ImageIcon className="size-10 opacity-40" aria-hidden />
                  <p className="text-sm">Preview unavailable</p>
                </div>
              )}
              {active.type === "photo" || active.type === "video" ? (
                <div className="shrink-0 border-t border-ink/8 px-4 py-2.5">
                  <MediaCaptionEditor
                    key={active.id}
                    mediaId={active.id}
                    initialCaption={active.caption}
                    compact
                    onEditingChange={setCaptionEditing}
                    onCaptionChange={(caption) =>
                      handleCaptionChange(active.id, caption)
                    }
                  />
                </div>
              ) : null}
              <div className="flex flex-col gap-3 border-t border-ink/8 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p
                    id="media-viewer-title"
                    className="truncate text-sm text-ink"
                  >
                    {active.originalFilename ||
                      (active.type === "video"
                        ? "Family video"
                        : "Family photo")}
                  </p>
                  {canNavigate ? (
                    <p className="mt-0.5 text-xs text-ink-muted" aria-live="polite">
                      {index + 1} of {count}
                    </p>
                  ) : null}
                </div>
                <div className="flex min-w-0 flex-1 flex-col items-stretch gap-2 sm:max-w-md sm:items-end">
                  {active.type === "photo" || active.type === "video" ? (
                    <>
                      <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
                        <MediaTagsControl
                          mediaId={active.id}
                          compact
                          className="w-full sm:w-auto"
                          canNavigate={canNavigate}
                          onPrev={goPrev}
                          onNext={goNext}
                          onOpenChange={setTagsOpen}
                        />
                      </div>
                      <AssignMediaToPersonControl
                        mediaId={active.id}
                        className="w-full sm:max-w-sm"
                      />
                    </>
                  ) : null}
                  {onDelete ? (
                    <button
                      type="button"
                      onClick={() => void handleDelete()}
                      disabled={deleting}
                      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800 transition hover:bg-red-100 disabled:cursor-wait disabled:opacity-60"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      {deleting ? t("common.deleting") : t("common.delete")}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <ul className="media-gallery-grid grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4">
        {displayItems.map((item) => (
          <GalleryTile
            key={item.id}
            item={item}
            onOpen={open}
            tagModeEnabled={tagModeEnabled}
            tagModeActive={tagMode?.activeId === item.id}
          />
        ))}
      </ul>
      {viewer}
    </>
  );
}
