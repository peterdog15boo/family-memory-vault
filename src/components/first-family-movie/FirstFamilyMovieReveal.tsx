"use client";

import { useCallback, useEffect, useRef, useState, Component, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2, RotateCcw, Share2 } from "lucide-react";
import { MovieShareDialog } from "@/components/movies/MovieShareDialog";
import type { SerializedMovie } from "@/lib/movies/serialize";
import {
  downloadMovieFile,
  movieDownloadFilename,
} from "@/lib/movies/share";
import { trackFirstMovieEvent } from "@/lib/first-family-movie/track-client";
import { cn } from "@/lib/utils";

type Props = {
  movie: Pick<
    SerializedMovie,
    "id" | "title" | "playUrl" | "downloadUrl" | "thumbnailUrl" | "shareUrl" | "settings" | "durationSeconds" | "status"
  > &
    Partial<SerializedMovie>;
  /** Soft Continue — typically People Discovery (not vault home). */
  onContinue: () => void;
};

/**
 * Big Reveal — emotional peak after the first family movie is ready.
 * Dark, full-screen, autoplay; Replay + Download are primary. Share is optional.
 */
export function FirstFamilyMovieReveal({ movie, onContinue }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playback, setPlayback] = useState(movie);
  const [loadingUrl, setLoadingUrl] = useState(true);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareAvailable, setShareAvailable] = useState(true);
  const [ended, setEnded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const watchedRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fresh signed URLs for play + download.
  useEffect(() => {
    let cancelled = false;
    setLoadingUrl(true);
    setUrlError(null);

    (async () => {
      try {
        const res = await fetch(`/api/movies/${movie.id}`);
        const data = (await res.json().catch(() => ({}))) as {
          movie?: SerializedMovie;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !data.movie?.playUrl) {
          if (movie.playUrl) {
            setPlayback(movie as SerializedMovie);
          } else {
            throw new Error(data.error || "Playback isn’t available yet.");
          }
        } else {
          setPlayback(data.movie);
        }
      } catch (err) {
        if (cancelled) return;
        if (movie.playUrl) {
          setPlayback(movie as SerializedMovie);
        } else {
          setUrlError(
            err instanceof Error ? err.message : "Could not load your movie.",
          );
        }
      } finally {
        if (!cancelled) setLoadingUrl(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [movie]);

  const tryPlay = useCallback(async () => {
    const el = videoRef.current;
    if (!el) return;
    setEnded(false);
    try {
      el.muted = false;
      await el.play();
      setNeedsTap(false);
      if (!watchedRef.current) {
        watchedRef.current = true;
        trackFirstMovieEvent("first_movie_watched", { movieId: movie.id });
      }
    } catch {
      try {
        el.muted = true;
        await el.play();
        setNeedsTap(true);
        if (!watchedRef.current) {
          watchedRef.current = true;
          trackFirstMovieEvent("first_movie_watched", {
            movieId: movie.id,
            muted: true,
          });
        }
      } catch {
        setNeedsTap(true);
      }
    }
  }, [movie.id]);

  useEffect(() => {
    if (loadingUrl || !playback.playUrl) return;
    void tryPlay();
  }, [loadingUrl, playback.playUrl, tryPlay]);

  function handleReplay() {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = 0;
    setEnded(false);
    void tryPlay();
  }

  function handleDownload() {
    const ok = downloadMovieFile(playback as SerializedMovie);
    if (!ok && playback.downloadUrl) {
      const a = document.createElement("a");
      a.href = playback.downloadUrl;
      a.download = movieDownloadFilename(playback.title);
      a.rel = "noopener";
      a.click();
    }
  }

  function handleShare() {
    try {
      setShareOpen(true);
    } catch {
      setShareAvailable(false);
    }
  }

  function handleContinue() {
    onContinue();
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="ffm-reveal fixed inset-0 z-[90] flex flex-col bg-[#0c0a09] text-[#f4efe6]"
      role="dialog"
      aria-modal="true"
      aria-label="Your first family movie"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 20%, rgba(196,154,120,0.14), transparent 55%), radial-gradient(ellipse 50% 40% at 80% 100%, rgba(122,74,62,0.12), transparent 50%)",
        }}
      />

      <header className="relative z-10 flex items-center justify-between px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[#c4a87d]/90">
          Your first family movie
        </p>
        <button
          type="button"
          onClick={handleContinue}
          className="text-sm font-medium text-white/55 transition hover:text-white/90"
        >
          Continue
        </button>
      </header>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-3 sm:px-6">
        <div className="relative w-full max-w-5xl overflow-hidden rounded-sm bg-black shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
          {loadingUrl ? (
            <div className="flex aspect-video w-full items-center justify-center gap-2 text-sm text-white/70">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              Preparing your screening…
            </div>
          ) : playback.playUrl ? (
            <>
              <video
                ref={videoRef}
                key={playback.playUrl}
                src={playback.playUrl}
                poster={playback.thumbnailUrl ?? undefined}
                playsInline
                controls={ended || needsTap}
                aria-label={playback.title || "Your first family movie"}
                className="aspect-video w-full bg-black object-contain"
                onEnded={() => setEnded(true)}
                onPlay={() => setEnded(false)}
              />
              {needsTap && !ended ? (
                <button
                  type="button"
                  onClick={() => {
                    const el = videoRef.current;
                    if (!el) return;
                    el.muted = false;
                    void el
                      .play()
                      .then(() => {
                        setNeedsTap(false);
                        if (!watchedRef.current) {
                          watchedRef.current = true;
                          trackFirstMovieEvent("first_movie_watched", {
                            movieId: movie.id,
                          });
                        }
                      })
                      .catch(() => {
                        /* keep overlay */
                      });
                  }}
                  className="absolute inset-0 flex items-center justify-center bg-black/45 backdrop-blur-[1px]"
                >
                  <span className="rounded-full border border-white/25 bg-white/10 px-8 py-4 font-display text-lg tracking-tight text-white shadow-lg backdrop-blur-sm">
                    Tap to begin
                  </span>
                </button>
              ) : null}
            </>
          ) : (
            <div
              role="alert"
              className="flex aspect-video w-full items-center justify-center px-6 text-center text-sm text-white/75"
            >
              {urlError || "Playback isn’t available yet."}
            </div>
          )}
        </div>

        {!loadingUrl && playback.playUrl ? (
          <div
            className={cn(
              "ffm-reveal-actions relative z-10 mt-8 flex w-full max-w-lg flex-col items-stretch gap-3 px-2 sm:flex-row sm:justify-center",
              ended || needsTap ? "opacity-100" : "opacity-95",
            )}
          >
            {ended ? (
              <button
                type="button"
                onClick={handleContinue}
                className="inline-flex h-14 w-full items-center justify-center rounded-xl bg-[#c4a87d] px-6 text-base font-semibold text-[#1a1612] transition hover:bg-[#d4bc96] sm:order-first sm:col-span-2"
              >
                Continue
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleReplay}
              className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-[#f4efe6] px-6 text-base font-semibold text-[#1a1612] transition hover:bg-white"
            >
              <RotateCcw className="size-5" aria-hidden />
              Replay
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!playback.downloadUrl && !playback.playUrl}
              className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/5 px-6 text-base font-semibold text-[#f4efe6] transition hover:border-white/40 hover:bg-white/10 disabled:opacity-40"
            >
              <Download className="size-5" aria-hidden />
              Download
            </button>
          </div>
        ) : null}

        {shareAvailable && !loadingUrl && (playback.downloadUrl || playback.playUrl) ? (
          <button
            type="button"
            onClick={handleShare}
            className="relative z-10 mt-4 inline-flex items-center gap-2 text-sm font-medium text-white/50 transition hover:text-white/85"
          >
            <Share2 className="size-3.5" aria-hidden />
            Share
          </button>
        ) : null}
      </div>

      <footer className="relative z-10 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 text-center sm:px-8">
        <p className="text-xs text-white/40">
          Made with care in Family Memory Vault
        </p>
      </footer>

      {shareOpen && shareAvailable ? (
        <ShareCatch
          movie={playback as SerializedMovie}
          onClose={() => setShareOpen(false)}
          onFatal={() => {
            setShareOpen(false);
            setShareAvailable(false);
          }}
        />
      ) : null}
    </div>,
    document.body,
  );
}

/** Isolate share dialog failures so the ritual never hard-crashes. */
class ShareCatch extends Component<
  {
    movie: SerializedMovie;
    onClose: () => void;
    onFatal: () => void;
  },
  { broken: boolean }
> {
  state = { broken: false };

  static getDerivedStateFromError() {
    return { broken: true };
  }

  componentDidCatch() {
    this.props.onFatal();
  }

  render(): ReactNode {
    if (this.state.broken) return null;
    return (
      <MovieShareDialog movie={this.props.movie} onClose={this.props.onClose} />
    );
  }
}
