"use client";

import { useState } from "react";
import { Download, Loader2, Share2 } from "lucide-react";

type SharedMovie = {
  title: string;
  durationSeconds: number | null;
  styleLabel: string;
  playUrl: string | null;
  downloadUrl: string | null;
  thumbnailUrl: string | null;
};

type SharedMovieViewProps = {
  movie: SharedMovie;
};

/**
 * Public player + mobile-friendly share/download for a single shared movie.
 */
export function SharedMovieView({ movie }: SharedMovieViewProps) {
  const [busy, setBusy] = useState<"share" | "download" | null>(null);
  const playUrl = movie.playUrl;
  const downloadUrl = movie.downloadUrl || movie.playUrl;

  async function onShare() {
    if (!playUrl || typeof navigator === "undefined") return;
    setBusy("share");
    try {
      const pageUrl = window.location.href;
      if (typeof navigator.share === "function") {
        await navigator.share({
          title: movie.title,
          text: `Watch “${movie.title}”`,
          url: pageUrl,
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(pageUrl);
      }
    } catch {
      // User cancel is fine.
    } finally {
      setBusy(null);
    }
  }

  function onDownload() {
    if (!downloadUrl) return;
    setBusy("download");
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = `${(movie.title || "movie").replace(/[^\w\s-]+/g, "").trim() || "movie"}.mp4`;
    anchor.rel = "noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => setBusy(null), 600);
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-2xl shadow-black/40">
        {playUrl ? (
          <video
            key={playUrl}
            className="aspect-video w-full bg-black"
            controls
            playsInline
            preload="metadata"
            poster={movie.thumbnailUrl ?? undefined}
            src={playUrl}
          >
            Your browser can’t play this video.
          </video>
        ) : (
          <div className="flex aspect-video items-center justify-center px-6 text-center text-sm text-[#f7f0e8]/70">
            This movie isn’t available to play right now.
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => void onShare()}
          disabled={!playUrl || busy === "share"}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 text-sm font-medium transition hover:bg-white/10 disabled:opacity-50 sm:flex-none"
        >
          {busy === "share" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Share2 className="size-4" aria-hidden />
          )}
          Share
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={!downloadUrl || busy === "download"}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 text-sm font-medium transition hover:bg-white/10 disabled:opacity-50 sm:flex-none"
        >
          {busy === "download" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Download className="size-4" aria-hidden />
          )}
          Download
        </button>
      </div>
    </div>
  );
}
