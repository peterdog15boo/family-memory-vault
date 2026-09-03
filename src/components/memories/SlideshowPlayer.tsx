"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pause,
  Play,
  Settings2,
  X,
} from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import {
  normalizeSlideshowSettings,
  SLIDESHOW_TRANSITIONS,
  type SlideshowTransition,
} from "@/lib/memories/settings";
import type {
  SerializedMemoryMediaItem,
  SerializedMemoryWithMedia,
} from "@/lib/memories/types";
import { MediaViewerMedia } from "@/components/media/MediaViewerMedia";
import { preloadMediaViewerUrls } from "@/components/media/useMediaViewerSrc";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import { cn } from "@/lib/utils";

type SlideshowPlayerProps = {
  memory: SerializedMemoryWithMedia;
  canEdit: boolean;
  onClose: () => void;
  onSettingsSaved?: (memory: SerializedMemoryWithMedia) => void;
};

export function SlideshowPlayer({
  memory,
  canEdit,
  onClose,
  onSettingsSaved,
}: SlideshowPlayerProps) {
  const t = useTranslations();
  const items = memory.media;
  const initial = normalizeSlideshowSettings(memory.settings);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [transition, setTransition] = useState<SlideshowTransition>(
    initial.transition,
  );
  const [photoDurationMs, setPhotoDurationMs] = useState(
    initial.photoDurationMs,
  );
  const [showSettings, setShowSettings] = useState(false);
  const [fadeKey, setFadeKey] = useState(0);
  const [pending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedAtRef = useRef(Date.now());
  const indexRef = useRef(index);
  indexRef.current = index;

  const current = items[index] ?? null;
  const isVideo = current?.type === "video";

  useOverlayA11y({
    open: true,
    onClose,
    containerRef: dialogRef,
    escapeEnabled: !showSettings,
    trapFocus: !showSettings,
  });

  useOverlayA11y({
    open: showSettings,
    onClose: () => setShowSettings(false),
    containerRef: settingsRef,
    lockScroll: false,
  });

  const clearAdvanceTimer = useCallback(() => {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  }, []);

  const goTo = useCallback(
    (nextIndex: number) => {
      if (items.length === 0) return;
      const wrapped = ((nextIndex % items.length) + items.length) % items.length;
      clearAdvanceTimer();
      setIndex(wrapped);
      setFadeKey((k) => k + 1);
    },
    [items.length, clearAdvanceTimer],
  );

  const goNext = useCallback(() => {
    goTo(indexRef.current + 1);
  }, [goTo]);

  const goPrev = useCallback(() => {
    goTo(indexRef.current - 1);
  }, [goTo]);

  // Photo auto-advance while playing
  useEffect(() => {
    clearAdvanceTimer();
    if (!playing || !current || isVideo || items.length === 0) return;

    advanceTimer.current = setTimeout(() => {
      goNext();
    }, photoDurationMs);

    return clearAdvanceTimer;
  }, [
    playing,
    current,
    isVideo,
    photoDurationMs,
    items.length,
    goNext,
    clearAdvanceTimer,
    fadeKey,
  ]);

  // Video play/pause sync
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return;

    if (playing) {
      void video.play().catch(() => {
        // Autoplay may be blocked until user interacts — keep controls available.
      });
    } else {
      video.pause();
    }
  }, [playing, isVideo, index, fadeKey]);

  // Preload next 1–2 full-res slides (never thumbnails).
  useEffect(() => {
    if (items.length === 0) return;
    const upcoming: Array<{ mediaId: string; type: string }> = [];
    for (let offset = 1; offset <= 2; offset++) {
      const item = items[(index + offset) % items.length];
      if (item && item.id !== current?.id) {
        upcoming.push({ mediaId: item.id, type: item.type });
      }
    }
    // Also warm previous for back navigation.
    const prev = items[(index - 1 + items.length) % items.length];
    if (prev && prev.id !== current?.id) {
      upcoming.push({ mediaId: prev.id, type: prev.type });
    }
    preloadMediaViewerUrls(upcoming);
  }, [index, items, current?.id]);

  // Keyboard navigation (Escape + focus trap via useOverlayA11y)
  useEffect(() => {
    if (showSettings) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      } else if (event.key === " " || event.key === "k") {
        event.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, showSettings]);

  function saveSettings() {
    if (!canEdit) return;
    setSaveError(null);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/memories/${memory.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            settings: {
              slideshow: {
                transition,
                photoDurationMs,
              },
            },
          }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          memory?: SerializedMemoryWithMedia;
        };
        if (!response.ok || !data.memory) {
          throw new Error(data.error || t("memories.errorSaveSlideshow"));
        }
        onSettingsSaved?.(data.memory);
        setShowSettings(false);
      } catch (error) {
        setSaveError(
          error instanceof Error
            ? error.message
            : t("memories.errorSaveSettings"),
        );
      }
    });
  }

  if (items.length === 0) {
    return createPortal(
      <div
        ref={dialogRef}
        data-app-portal=""
        className="slideshow-player fixed inset-0 z-[200] flex items-center justify-center bg-ink/90 p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="slideshow-empty-title"
        tabIndex={-1}
      >
        <div className="max-w-sm rounded-xl bg-canvas p-6 text-center">
          <p
            id="slideshow-empty-title"
            className="font-display text-xl text-ink"
          >
            {t("memories.slideshowEmptyTitle")}
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            {t("memories.slideshowEmptyBody")}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {t("common.close")}
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      ref={dialogRef}
      data-app-portal=""
      className="slideshow-player fixed inset-0 z-[200] flex flex-col bg-[#1a1816]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="slideshow-title"
      tabIndex={-1}
    >
      {/* Top bar */}
      <div className="relative z-20 flex items-center justify-between gap-3 px-4 py-3 text-white">
        <div className="min-w-0">
          <p
            id="slideshow-title"
            className="truncate font-display text-lg tracking-tight"
          >
            {memory.title}
          </p>
          <p className="text-xs text-white/85">
            {index + 1} / {items.length}
            {current?.originalFilename
              ? ` · ${current.originalFilename}`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {canEdit ? (
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className="rounded-md p-2 text-white/95 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              aria-label={t("memories.slideshowSettingsAria")}
              aria-expanded={showSettings}
              aria-controls="slideshow-settings"
              aria-haspopup="dialog"
            >
              <Settings2 className="size-5" aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-white/95 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-label={t("memories.closeSlideshow")}
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      {/* Stage — click empty chrome to close; ignore the opening gesture */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-24 sm:px-8"
        onClick={() => {
          if (Date.now() - openedAtRef.current < 400) return;
          onClose();
        }}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            goPrev();
          }}
          className="absolute left-2 z-10 rounded-full bg-black/60 p-2 text-white backdrop-blur-sm transition hover:bg-black/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:left-4"
          aria-label={t("common.previous")}
        >
          <ChevronLeft className="size-6" aria-hidden />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            goNext();
          }}
          className="absolute right-2 z-10 rounded-full bg-black/60 p-2 text-white backdrop-blur-sm transition hover:bg-black/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:right-4"
          aria-label={t("common.next")}
        >
          <ChevronRight className="size-6" aria-hidden />
        </button>

        <div
          key={fadeKey}
          className={cn(
            "relative flex max-h-full max-w-full items-center justify-center",
            transition === "fade" && "animate-slideshow-fade",
            transition === "slide" && "animate-slideshow-slide",
          )}
          onClick={(event) => event.stopPropagation()}
        >
          {current ? (
            <SlideMedia
              item={current}
              videoRef={videoRef}
              familyPhotoAlt={t("memories.familyPhotoAlt")}
              onVideoEnded={() => {
                if (playing) goNext();
              }}
            />
          ) : null}
        </div>
      </div>

      {/* Controls */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 to-transparent px-4 pb-5 pt-10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto flex max-w-lg flex-col items-center gap-3">
          <div className="flex w-full gap-1">
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onClick={() => goTo(i)}
                aria-label={t("memories.goToSlide", { n: i + 1 })}
                className={cn(
                  "h-1 flex-1 rounded-full transition",
                  i === index ? "bg-accent" : "bg-white/25 hover:bg-white/40",
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={goPrev}
              className="rounded-full p-2 text-white/95 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              aria-label={t("common.previous")}
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="flex size-12 items-center justify-center rounded-full bg-accent-deep text-white shadow-lg transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              aria-label={playing ? t("common.pause") : t("common.play")}
            >
              {playing ? (
                <Pause className="size-5 fill-current" aria-hidden />
              ) : (
                <Play className="size-5 fill-current pl-0.5" aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={goNext}
              className="rounded-full p-2 text-white/95 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              aria-label={t("common.next")}
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {/* Settings sheet */}
      {showSettings ? (
        <div
          ref={settingsRef}
          id="slideshow-settings"
          role="dialog"
          aria-modal="true"
          aria-labelledby="slideshow-settings-title"
          tabIndex={-1}
          className="absolute inset-x-0 bottom-0 z-30 rounded-t-2xl border border-white/10 bg-[#2a2623] p-5 text-accent-foreground shadow-2xl sm:inset-x-auto sm:bottom-24 sm:right-4 sm:w-80 sm:rounded-xl"
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 id="slideshow-settings-title" className="font-display text-lg">
              {t("memories.slideshowSettingsTitle")}
            </h3>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="rounded-md p-1 text-white/95 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              aria-label={t("memories.closeSettings")}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <label className="block text-xs text-white/85">
            {t("memories.transition")}
            <select
              value={transition}
              onChange={(event) =>
                setTransition(event.target.value as SlideshowTransition)
              }
              className="mt-1.5 w-full rounded-md border border-white/25 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white focus-visible:ring-2 focus-visible:ring-white/70"
            >
              {SLIDESHOW_TRANSITIONS.map((value) => (
                <option key={value} value={value}>
                  {value === "fade"
                    ? t("memories.transitionFade")
                    : value === "slide"
                      ? t("memories.transitionSlide")
                      : t("memories.transitionNone")}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-4 block text-xs text-white/85">
            {t("memories.photoDuration", {
              seconds: (photoDurationMs / 1000).toFixed(1),
            })}
            <input
              type="range"
              min={2000}
              max={12000}
              step={500}
              value={photoDurationMs}
              onChange={(event) =>
                setPhotoDurationMs(Number(event.target.value))
              }
              className="mt-2 w-full accent-[var(--accent-deep)]"
            />
          </label>

          <p className="mt-4 text-xs leading-relaxed text-white/80">
            {t("memories.slideshowSettingsHint")}
          </p>

          {saveError ? (
            <p className="mt-3 text-xs text-red-300" role="alert">
              {saveError}
            </p>
          ) : null}

          <button
            type="button"
            onClick={saveSettings}
            disabled={pending}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent-deep px-3 py-2.5 text-sm font-medium text-white hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {t("memories.savePreferences")}
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

function SlideMedia({
  item,
  videoRef,
  onVideoEnded,
  familyPhotoAlt,
}: {
  item: SerializedMemoryMediaItem;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onVideoEnded: () => void;
  familyPhotoAlt: string;
}) {
  return (
    <MediaViewerMedia
      mediaId={item.id}
      type={item.type}
      alt={item.originalFilename || familyPhotoAlt}
      className="max-h-[70vh] sm:max-h-[75vh]"
      videoRef={videoRef}
      onVideoEnded={onVideoEnded}
      videoControls={false}
      onDark
    />
  );
}
