"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, Video, X } from "lucide-react";
import {
  fetchLegacyVideoPlayback,
  type LegacyVideoMediaResponse,
  type LegacyVideoPlaybackSource,
} from "@/lib/legacy/video-playback-client";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
type LegacyVideoPlayerProps = {
  playbackUrl: string;
  posterUrl?: string | null;
  title: string;
  contentType?: string;
  autoPlay?: boolean;
  onExpired?: () => void;
  className?: string;
};

/**
 * Mobile-friendly HTML5 player for a short-lived signed URL.
 * Does not preload until a src is provided by the parent.
 */
export function LegacyVideoPlayer({
  playbackUrl,
  posterUrl,
  title,
  contentType,
  autoPlay = true,
  onExpired,
  className,
}: LegacyVideoPlayerProps) {
  return (
    <video
      key={playbackUrl}
      src={playbackUrl}
      poster={posterUrl || undefined}
      controls
      playsInline
      autoPlay={autoPlay}
      preload="metadata"
      controlsList="nodownload"
      className={
        className ?? "max-h-[75vh] w-full bg-black object-contain"
      }
      onError={() => onExpired?.()}
      aria-label={title}
    >
      {contentType ? (
        <source src={playbackUrl} type={contentType} />
      ) : null}
      Your browser does not support secure video playback.
    </video>
  );
}

type LegacyVideoPlaybackModalProps = {
  open: boolean;
  source: LegacyVideoPlaybackSource | null;
  fallbackTitle?: string;
  onClose: () => void;
};

/**
 * Secure playback modal: fetches a short-lived URL on open, never from list preload.
 */
export function LegacyVideoPlaybackModal({
  open,
  source,
  fallbackTitle = "Video message",
  onClose,
}: LegacyVideoPlaybackModalProps) {
  const [media, setMedia] = useState<LegacyVideoMediaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!source) return;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchLegacyVideoPlayback(source);
      if (!next.playbackUrl) {
        throw new Error("Playback is unavailable for this video.");
      }
      setMedia(next);
    } catch (err) {
      setMedia(null);
      setError(
        err instanceof Error
          ? err.message
          : "Could not open this video securely.",
      );
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => {
    if (!open || !source) {
      setMedia(null);
      setError(null);
      return;
    }
    void load();
  }, [open, source, load]);

  const dialogRef = useRef<HTMLDivElement>(null);
  useOverlayA11y({
    open: open && Boolean(source),
    onClose,
    containerRef: dialogRef,
  });

  if (!open || !source) return null;

  const title = media?.title || fallbackTitle;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
      className="ui-modal-backdrop bg-[color:var(--legacy-ink)]/55 p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="ui-modal-panel relative w-full max-w-3xl overflow-hidden bg-[color:var(--legacy-surface)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--legacy-line)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Video
              className="size-4 shrink-0 text-[color:var(--legacy-accent)]"
              aria-hidden
            />
            <p className="truncate text-sm font-medium text-[color:var(--legacy-ink)]">
              {title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[color:var(--legacy-muted)] hover:bg-[color:var(--legacy-accent-soft)]"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-[12rem] bg-black">
          {loading ? (
            <div className="flex min-h-[12rem] flex-col items-center justify-center gap-2 text-white/80">
              <Loader2 className="size-6 animate-spin" aria-hidden />
              <p className="text-sm">Preparing a secure player…</p>
            </div>
          ) : error ? (
            <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 px-4 text-center text-white/90">
              <p className="text-sm">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-1.5 rounded-md bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25"
              >
                <RefreshCw className="size-3.5" aria-hidden />
                Try again
              </button>
            </div>
          ) : media?.playbackUrl ? (
            <LegacyVideoPlayer
              playbackUrl={media.playbackUrl}
              posterUrl={media.thumbnailUrl}
              title={title}
              contentType={media.contentType}
              onExpired={() => void load()}
            />
          ) : null}
        </div>

        <p className="border-t border-[color:var(--legacy-line)] px-4 py-2.5 text-xs text-[color:var(--legacy-muted)]">
          This private link expires quickly for your security. If playback stops,
          open the video again.
        </p>
      </div>
    </div>
  );
}
