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
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indexRef = useRef(index);
  indexRef.current = index;

  const current = items[index] ?? null;
  const isVideo = current?.type === "video";

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

  // Keyboard
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
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
  }, [goNext, goPrev, onClose]);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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
          throw new Error(data.error || "Could not save slideshow settings.");
        }
        onSettingsSaved?.(data.memory);
        setShowSettings(false);
      } catch (error) {
        setSaveError(
          error instanceof Error ? error.message : "Could not save settings.",
        );
      }
    });
  }

  if (items.length === 0) {
    return createPortal(
      <div className="slideshow-player fixed inset-0 z-[80] flex items-center justify-center bg-ink/90 p-6">
        <div className="max-w-sm rounded-xl bg-canvas p-6 text-center">
          <p className="font-display text-xl text-ink">Nothing to play yet</p>
          <p className="mt-2 text-sm text-ink-muted">
            Add photos or videos to this memory first.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground"
          >
            Close
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="slideshow-player fixed inset-0 z-[80] flex flex-col bg-[#1a1816]"
      role="dialog"
      aria-modal="true"
      aria-label={`Slideshow: ${memory.title}`}
    >
      {/* Top bar */}
      <div className="relative z-20 flex items-center justify-between gap-3 px-4 py-3 text-accent-foreground/90">
        <div className="min-w-0">
          <p className="truncate font-display text-lg tracking-tight">
            {memory.title}
          </p>
          <p className="text-xs text-accent-foreground/55">
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
              className="rounded-md p-2 transition hover:bg-white/10"
              aria-label="Slideshow settings"
            >
              <Settings2 className="size-5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 transition hover:bg-white/10"
            aria-label="Close slideshow"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      {/* Stage — click empty chrome to close; media stops propagation */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-24 sm:px-8"
        onClick={onClose}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            goPrev();
          }}
          className="absolute left-2 z-10 rounded-full bg-black/35 p-2 text-accent-foreground backdrop-blur-sm transition hover:bg-black/55 sm:left-4"
          aria-label="Previous"
        >
          <ChevronLeft className="size-6" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            goNext();
          }}
          className="absolute right-2 z-10 rounded-full bg-black/35 p-2 text-accent-foreground backdrop-blur-sm transition hover:bg-black/55 sm:right-4"
          aria-label="Next"
        >
          <ChevronRight className="size-6" />
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
                aria-label={`Go to slide ${i + 1}`}
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
              className="rounded-full p-2 text-accent-foreground/80 hover:bg-white/10"
              aria-label="Previous"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg transition hover:bg-accent-deep"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Pause className="size-5 fill-current" />
              ) : (
                <Play className="size-5 fill-current pl-0.5" />
              )}
            </button>
            <button
              type="button"
              onClick={goNext}
              className="rounded-full p-2 text-accent-foreground/80 hover:bg-white/10"
              aria-label="Next"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Settings sheet */}
      {showSettings ? (
        <div className="absolute inset-x-0 bottom-0 z-30 rounded-t-2xl border border-white/10 bg-[#2a2623] p-5 text-accent-foreground shadow-2xl sm:inset-x-auto sm:bottom-24 sm:right-4 sm:w-80 sm:rounded-xl">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-lg">Slideshow settings</h3>
            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="rounded-md p-1 hover:bg-white/10"
              aria-label="Close settings"
            >
              <X className="size-4" />
            </button>
          </div>

          <label className="block text-xs text-accent-foreground/70">
            Transition
            <select
              value={transition}
              onChange={(event) =>
                setTransition(event.target.value as SlideshowTransition)
              }
              className="mt-1.5 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-accent-foreground outline-none focus:border-accent"
            >
              {SLIDESHOW_TRANSITIONS.map((value) => (
                <option key={value} value={value}>
                  {value === "fade"
                    ? "Fade"
                    : value === "slide"
                      ? "Slide"
                      : "None"}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-4 block text-xs text-accent-foreground/70">
            Photo duration ({(photoDurationMs / 1000).toFixed(1)}s)
            <input
              type="range"
              min={2000}
              max={12000}
              step={500}
              value={photoDurationMs}
              onChange={(event) =>
                setPhotoDurationMs(Number(event.target.value))
              }
              className="mt-2 w-full accent-[var(--accent)]"
            />
          </label>

          <p className="mt-4 text-xs leading-relaxed text-accent-foreground/50">
            Background music can be added in a later update. Videos always play
            through before advancing.
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
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent-deep disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            Save preferences
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
}: {
  item: SerializedMemoryMediaItem;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onVideoEnded: () => void;
}) {
  return (
    <MediaViewerMedia
      mediaId={item.id}
      type={item.type}
      alt={item.originalFilename || "Family photo"}
      className="max-h-[70vh] sm:max-h-[75vh]"
      videoRef={videoRef}
      onVideoEnded={onVideoEnded}
      videoControls={false}
      onDark
    />
  );
}
