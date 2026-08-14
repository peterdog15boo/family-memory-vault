"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Film, Images } from "lucide-react";
import { MovieCard } from "@/components/movies/MovieCard";
import { MoviePlayer } from "@/components/movies/MoviePlayer";
import { EmptyState } from "@/components/ui/EmptyState";
import { useCopy, useTranslations } from "@/components/i18n/LocaleProvider";
import type { SerializedMovie } from "@/lib/movies/serialize";
import { beginCriticalWork } from "@/lib/session/critical-activity";

type MovieLibraryProps = {
  initialMovies: SerializedMovie[];
  /** When true, each card links to its parent memory. */
  showMemoryLink?: boolean;
  /** Bump to refetch (e.g. after creating a movie). */
  refreshKey?: number;
  /** Optional filter — when set, only fetch/list for this memory. */
  memoryId?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Default CTA goes to memories list unless overridden. */
  emptyActionHref?: string;
  emptyActionLabel?: string;
  className?: string;
};

export function MovieLibrary({
  initialMovies,
  showMemoryLink = false,
  refreshKey = 0,
  memoryId,
  emptyTitle,
  emptyDescription,
  emptyActionHref = "/memories",
  emptyActionLabel,
  className,
}: MovieLibraryProps) {
  const copy = useCopy();
  const t = useTranslations();
  const resolvedEmptyTitle = emptyTitle ?? copy.empty.movies.title;
  const resolvedEmptyDescription =
    emptyDescription ?? copy.empty.movies.description;
  const resolvedEmptyActionLabel =
    emptyActionLabel ?? t("pages.browseMemories");
  const [movies, setMovies] = useState(initialMovies);
  const [playing, setPlaying] = useState<SerializedMovie | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const url = memoryId
      ? `/api/memories/${memoryId}/movies`
      : "/api/movies";
    try {
      const response = await fetch(url);
      const data = (await response.json().catch(() => ({}))) as {
        movies?: SerializedMovie[];
        error?: string;
      };
      if (!response.ok || !data.movies) {
        throw new Error(data.error || "Could not load movies.");
      }
      setMovies(data.movies);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load movies.");
    }
  }, [memoryId]);

  useEffect(() => {
    setMovies(initialMovies);
  }, [initialMovies]);

  useEffect(() => {
    if (refreshKey > 0) {
      void load();
    }
  }, [refreshKey, load]);

  // Soft-poll while any movie is still rendering.
  useEffect(() => {
    const pending = movies.some(
      (m) => m.status === "queued" || m.status === "processing",
    );
    if (!pending) return;
    const id = setInterval(() => {
      void load();
    }, 4000);
    return () => clearInterval(id);
  }, [movies, load]);

  // Idle session: treat library renders as critical work (warn before logout).
  const endMovieRenderRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const pending = movies.some(
      (m) => m.status === "queued" || m.status === "processing",
    );
    if (pending && !endMovieRenderRef.current) {
      endMovieRenderRef.current = beginCriticalWork("movie_render");
    } else if (!pending && endMovieRenderRef.current) {
      endMovieRenderRef.current();
      endMovieRenderRef.current = null;
    }
  }, [movies]);
  useEffect(
    () => () => {
      endMovieRenderRef.current?.();
      endMovieRenderRef.current = null;
    },
    [],
  );

  async function handleDelete(movie: SerializedMovie) {
    const ok = window.confirm(
      `Delete “${movie.title}”? This cannot be undone.`,
    );
    if (!ok) return;

    setBusyId(movie.id);
    setError(null);
    try {
      const response = await fetch(`/api/movies/${movie.id}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || "Could not delete movie.");
      }
      setMovies((prev) => prev.filter((m) => m.id !== movie.id));
      if (playing?.id === movie.id) setPlaying(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete movie.");
    } finally {
      setBusyId(null);
    }
  }

  async function handlePlay(movie: SerializedMovie) {
    // Refresh signed URL in case the list URL expired.
    try {
      const response = await fetch(`/api/movies/${movie.id}`);
      const data = (await response.json().catch(() => ({}))) as {
        movie?: SerializedMovie;
      };
      setPlaying(data.movie?.playUrl ? data.movie : movie);
    } catch {
      setPlaying(movie);
    }
  }

  if (movies.length === 0) {
    return (
      <div className={className}>
        <EmptyState
          icon={Film}
          title={resolvedEmptyTitle}
          description={resolvedEmptyDescription}
          action={{
            href: emptyActionHref,
            label: resolvedEmptyActionLabel,
            icon: Images,
          }}
        />
        {error ? (
          <p className="mt-3 text-center text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={className}>
      {error ? (
        <p
          className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {movies.map((movie) => (
          <MovieCard
            key={movie.id}
            movie={movie}
            showMemoryLink={showMemoryLink}
            busy={busyId === movie.id}
            onPlay={handlePlay}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {playing ? (
        <MoviePlayer movie={playing} onClose={() => setPlaying(null)} />
      ) : null}
    </div>
  );
}
