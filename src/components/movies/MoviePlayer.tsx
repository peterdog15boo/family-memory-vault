"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, Share2, X } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import type { SerializedMovie } from "@/lib/movies/serialize";
import { MovieShareDialog } from "@/components/movies/MovieShareDialog";
import {
  downloadMovieFile,
  movieAspectClass,
  movieAspectFromSettings,
} from "@/lib/movies/share";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import { cn } from "@/lib/utils";

type MoviePlayerProps = {
  movie: SerializedMovie;
  onClose: () => void;
};

/**
 * Fullscreen-ish player for a generated movie.
 * Always refreshes the signed R2 URL on open so list/SSR URLs that expired
 * do not surface Cloudflare's ExpiredRequest XML page.
 */
export function MoviePlayer({ movie, onClose }: MoviePlayerProps) {
  const t = useTranslations();
  const videoRef = useRef<HTMLVideoElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [playback, setPlayback] = useState<SerializedMovie>(movie);
  const [loadingUrl, setLoadingUrl] = useState(true);
  const [urlError, setUrlError] = useState<string | null>(null);
  const aspect = movieAspectFromSettings(playback.settings);
  const aspectClass = movieAspectClass(aspect);

  useOverlayA11y({
    open: true,
    onClose,
    containerRef: dialogRef,
    escapeEnabled: !shareOpen,
    trapFocus: !shareOpen,
  });

  useEffect(() => {
    let cancelled = false;
    setLoadingUrl(true);
    setUrlError(null);

    (async () => {
      try {
        const response = await fetch(`/api/movies/${movie.id}`);
        const data = (await response.json().catch(() => ({}))) as {
          movie?: SerializedMovie;
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok || !data.movie?.playUrl) {
          throw new Error(
            data.error || t("movie.playbackExpired"),
          );
        }
        setPlayback(data.movie);
      } catch (err) {
        if (cancelled) return;
        // Fall back to the URL we were given if refresh fails.
        if (movie.playUrl) {
          setPlayback(movie);
        } else {
          setUrlError(
            err instanceof Error
              ? err.message
              : t("movie.playbackLoadFailed"),
          );
        }
      } finally {
        if (!cancelled) setLoadingUrl(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [movie, t]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !playback.playUrl || loadingUrl) return;
    void el.play().catch(() => {
      // Autoplay may be blocked — controls remain available.
    });
  }, [playback.playUrl, loadingUrl]);

  return createPortal(
    <div
      ref={dialogRef}
      className="movie-player fixed inset-0 z-[80] flex items-center justify-center bg-ink/80 p-3 backdrop-blur-sm sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="movie-player-title"
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-xl bg-ink shadow-2xl",
          aspect === "9:16"
            ? "max-w-md"
            : aspect === "1:1"
              ? "max-w-xl"
              : "max-w-4xl",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <p
              id="movie-player-title"
              className="truncate font-display text-lg text-white"
            >
              {playback.title}
            </p>
            <p className="truncate text-xs text-white/80">
              {playback.styleLabel}
              {` · ${aspect}`}
              {playback.durationSeconds
                ? ` · ${Math.round(playback.durationSeconds)}s`
                : null}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {playback.downloadUrl ? (
              <button
                type="button"
                onClick={() => {
                  downloadMovieFile(playback);
                }}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-white/90 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <Download className="size-3.5" aria-hidden />
                {t("movie.download")}
              </button>
            ) : null}
            {playback.downloadUrl || playback.playUrl ? (
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-white/90 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                aria-haspopup="dialog"
                aria-expanded={shareOpen}
              >
                <Share2 className="size-3.5" aria-hidden />
                {t("movie.share")}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-white/90 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              aria-label={t("movie.closePlayer")}
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        </div>

        {loadingUrl ? (
          <div
            role="status"
            aria-live="polite"
            className={cn(
              aspectClass,
              "flex items-center justify-center gap-2 text-sm text-white/85",
            )}
          >
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("movie.loadingPlayback")}
          </div>
        ) : playback.playUrl ? (
          <video
            ref={videoRef}
            key={playback.playUrl}
            src={playback.playUrl}
            poster={playback.thumbnailUrl ?? undefined}
            controls
            playsInline
            aria-label={playback.title}
            className={cn(aspectClass, "w-full bg-black")}
          />
        ) : (
          <div
            role="alert"
            className={cn(
              aspectClass,
              "flex items-center justify-center px-6 text-center text-sm text-white/85",
            )}
          >
            {urlError || t("movie.playbackUnavailable")}
          </div>
        )}
      </div>

      {shareOpen ? (
        <MovieShareDialog
          movie={playback}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
    </div>,
    document.body,
  );
}
