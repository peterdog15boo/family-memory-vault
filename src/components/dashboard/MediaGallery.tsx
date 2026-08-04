"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Film, ImageIcon, Trash2, Upload, X } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { MediaThumb } from "@/components/memories/MediaThumb";
import { MediaViewerMedia } from "@/components/media/MediaViewerMedia";
import { AssignMediaToPersonControl } from "@/components/people/AssignMediaToPersonControl";
import { COPY } from "@/lib/copy";
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
  /** Owner-only delete from the preview lightbox. */
  onDelete?: (item: GalleryItem) => void | Promise<void>;
  deletingId?: string | null;
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
              video.currentTime = Math.min(0.35, video.duration * 0.08);
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
}: {
  item: GalleryItem;
  onOpen: (id: string) => void;
}) {
  const label = item.originalFilename || "Family photo";

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item.id)}
        className={cn(
          "media-tile group relative aspect-square w-full overflow-hidden rounded-lg",
          "border border-ink/8 bg-canvas-deep text-left transition",
          "hover:border-accent/40 hover:shadow-sm focus-visible:outline-none",
          "focus-visible:ring-2 focus-visible:ring-accent/40",
        )}
      >
        {item.previewUrl && (item.type === "photo" || item.hasThumbnail) ? (
          <div className="h-full w-full transition duration-300 group-hover:scale-[1.03]">
            <MediaThumb item={item} alt={label} />
          </div>
        ) : item.previewUrl && item.type === "video" ? (
          <VideoThumbnail
            src={item.previewUrl}
            alt={item.originalFilename || "Family video"}
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
              {item.hasThumbnail ? "Loading preview…" : "Almost ready…"}
            </span>
          </div>
        )}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/50 to-transparent px-2 pb-2 pt-8 text-[11px] text-accent-foreground opacity-0 transition group-hover:opacity-100">
          <span className="line-clamp-1">
            {item.originalFilename || "Memory"}
          </span>
        </span>
      </button>
    </li>
  );
});

export function MediaGallery({
  items,
  emptyTitle = COPY.empty.mediaOwn.title,
  emptyDescription = COPY.empty.mediaOwn.description,
  emptyActionHref = "/upload",
  emptyActionLabel = "Upload photos",
  onDelete,
  deletingId = null,
}: MediaGalleryProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const active = items.find((item) => item.id === activeId) ?? null;
  const deleting = Boolean(active && deletingId === active.id);

  const open = useCallback((id: string) => setActiveId(id), []);
  const close = useCallback(() => setActiveId(null), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!active || !onDelete || deleting) return;
    const label = active.originalFilename || "this photo";
    const ok = window.confirm(
      `Delete “${label}”? This permanently removes it from Photos and cannot be undone.`,
    );
    if (!ok) return;
    await onDelete(active);
  }, [active, deleting, onDelete]);

  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, close]);

  // Lock background scroll while the viewport overlay is open.
  useEffect(() => {
    if (!active) return;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollbarGap =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarGap > 0) {
      document.body.style.paddingRight = `${scrollbarGap}px`;
    }
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [active]);

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
        title={emptyTitle}
        description={emptyDescription}
        action={
          emptyActionHref
            ? {
                href: emptyActionHref,
                label: emptyActionLabel,
                icon: Upload,
              }
            : undefined
        }
        size="large"
      />
    );
  }

  const viewer =
    active && mounted
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={active.originalFilename || "Photo preview"}
            className="fixed inset-0 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm"
            style={{ zIndex: MEDIA_VIEWER_Z }}
            onClick={close}
          >
            <button
              type="button"
              onClick={close}
              className="ui-btn ui-btn-secondary absolute right-4 top-4 z-10"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>

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
              <div className="flex flex-col gap-3 border-t border-ink/8 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="min-w-0 truncate text-sm text-ink-muted">
                  {active.originalFilename || "Family photo"}
                </p>
                <div className="flex min-w-0 flex-1 flex-col items-stretch gap-2 sm:max-w-md sm:items-end">
                  {active.type === "photo" || active.type === "video" ? (
                    <AssignMediaToPersonControl
                      mediaId={active.id}
                      className="w-full sm:max-w-sm"
                    />
                  ) : null}
                  {onDelete ? (
                    <button
                      type="button"
                      onClick={() => void handleDelete()}
                      disabled={deleting}
                      className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800 transition hover:bg-red-100 disabled:cursor-wait disabled:opacity-60"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      {deleting ? "Deleting…" : "Delete"}
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
        {items.map((item) => (
          <GalleryTile key={item.id} item={item} onOpen={open} />
        ))}
      </ul>
      {viewer}
    </>
  );
}
