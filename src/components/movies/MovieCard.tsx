"use client";

import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import {
  Download,
  Film,
  Loader2,
  Play,
  Share2,
  Trash2,
} from "lucide-react";
import type { SerializedMovie } from "@/lib/movies/serialize";
import { MovieShareDialog } from "@/components/movies/MovieShareDialog";
import {
  movieAspectClass,
  movieAspectFromSettings,
  movieDownloadFilename,
} from "@/lib/movies/share";
import { useCopy } from "@/components/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

type MovieCardProps = {
  movie: SerializedMovie;
  /** Show link back to the parent memory. */
  showMemoryLink?: boolean;
  busy?: boolean;
  onPlay?: (movie: SerializedMovie) => void;
  onDelete?: (movie: SerializedMovie) => void;
};

export function MovieCard({
  movie,
  showMemoryLink = false,
  busy = false,
  onPlay,
  onDelete,
}: MovieCardProps) {
  const copy = useCopy();
  const [shareOpen, setShareOpen] = useState(false);
  const ready = movie.status === "ready" && Boolean(movie.playUrl);
  const processing =
    movie.status === "queued" || movie.status === "processing";
  const failed = movie.status === "failed";
  const dateLabel = format(parseISO(movie.createdAt), "MMM d, yyyy");
  const downloadName = movieDownloadFilename(movie.title);
  const aspect = movieAspectFromSettings(movie.settings);
  const aspectClass = movieAspectClass(aspect);

  return (
    <article
      className={cn(
        "list-card group overflow-hidden rounded-xl border border-ink/10 bg-canvas transition",
        "hover:border-ink/18",
      )}
    >
      <button
        type="button"
        disabled={!ready || busy}
        onClick={() => ready && onPlay?.(movie)}
        aria-label={
          ready
            ? `Play movie: ${movie.title}`
            : processing
              ? `${movie.title}: ${
                  movie.status === "queued"
                    ? copy.movie.status.queued
                    : copy.movie.status.processing
                }`
              : failed
                ? `${movie.title}: ${copy.movie.status.failed}`
                : movie.title
        }
        className={cn(
          "media-tile movie-poster relative block w-full overflow-hidden bg-ink/[0.06] text-left disabled:cursor-default",
          aspectClass,
        )}
      >
        {movie.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={movie.thumbnailUrl}
            alt=""
            className="media-thumb-img is-loaded h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Film className="size-10 text-ink/25" aria-hidden />
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-ink/55 via-transparent to-transparent" />

        {ready ? (
          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
            <span className="inline-flex size-12 items-center justify-center rounded-full bg-canvas/95 text-ink shadow-lg">
              <Play className="size-5 fill-current" aria-hidden />
            </span>
          </span>
        ) : null}

        {processing ? (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink/35 text-white backdrop-blur-[1px]">
            <Loader2 className="size-6 animate-spin" aria-hidden />
            <span className="text-xs font-medium tracking-wide">
              {movie.status === "queued"
                ? copy.movie.status.queued
                : copy.movie.status.processing}
            </span>
          </span>
        ) : null}

        {failed ? (
          <span className="absolute left-3 top-3 rounded-md bg-red-700/90 px-2 py-0.5 text-[11px] font-medium text-white">
            {copy.movie.status.failed}
          </span>
        ) : null}

        {movie.durationSeconds && ready ? (
          <span className="absolute bottom-2 right-2 rounded bg-ink/70 px-1.5 py-0.5 text-[11px] text-white">
            {Math.round(movie.durationSeconds)}s
          </span>
        ) : null}
      </button>

      <div className="p-3.5">
        <h3 className="font-display text-lg leading-snug tracking-tight text-ink">
          {movie.title}
        </h3>
        <p className="mt-1 text-sm text-ink-muted">
          {movie.styleLabel}
          <span className="mx-1.5 text-ink/25">·</span>
          {aspect}
          <span className="mx-1.5 text-ink/25">·</span>
          {dateLabel}
        </p>
        {showMemoryLink && movie.memoryTitle ? (
          <p className="mt-1 truncate text-xs text-ink-muted">
            From{" "}
            <Link
              href={`/memories/${movie.memoryId}`}
              className="text-accent-deep underline-offset-2 hover:underline"
            >
              {movie.memoryTitle}
            </Link>
          </p>
        ) : null}
        {failed && movie.errorMessage ? (
          <p className="mt-2 line-clamp-2 text-xs text-red-700">
            {movie.errorMessage}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {ready ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onPlay?.(movie)}
              className="ui-btn ui-btn-primary ui-btn-sm"
            >
              <Play className="size-3" aria-hidden />
              Play
            </button>
          ) : null}
          {ready && movie.downloadUrl ? (
            <a
              href={movie.downloadUrl}
              download={downloadName}
              className="ui-btn ui-btn-secondary ui-btn-sm"
            >
              <Download className="size-3" aria-hidden />
              Download
            </a>
          ) : null}
          {ready && (movie.downloadUrl || movie.playUrl) ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setShareOpen(true)}
              className="ui-btn ui-btn-ghost ui-btn-sm"
              aria-haspopup="dialog"
              aria-expanded={shareOpen}
            >
              <Share2 className="size-3" aria-hidden />
              Share
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onDelete(movie)}
              className="ui-btn ui-btn-ghost ui-btn-sm text-ink-muted hover:text-red-700"
            >
              {busy ? (
                <Loader2 className="size-3 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-3" aria-hidden />
              )}
              Delete
            </button>
          ) : null}
        </div>
      </div>

      {shareOpen ? (
        <MovieShareDialog movie={movie} onClose={() => setShareOpen(false)} />
      ) : null}
    </article>
  );
}
