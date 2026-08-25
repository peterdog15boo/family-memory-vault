"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FirstFamilyMovieReveal } from "@/components/first-family-movie/FirstFamilyMovieReveal";
import { FirstFamilyMovieWaitSlideshow } from "@/components/first-family-movie/FirstFamilyMovieWaitSlideshow";
import { FFM_SOFT_MIN_PHOTOS } from "@/lib/first-family-movie/guided-upload";
import type { SerializedMovie } from "@/lib/movies/serialize";
import { storeLastSimpleModeMusicTrackId } from "@/lib/movies/simple-mode";
import { trackFirstMovieEvent } from "@/lib/first-family-movie/track-client";
import { userFacingApiError } from "@/lib/http/user-messages";

type Props = {
  mediaIds: string[];
  /** Resume reveal when returning from a notification / refresh. */
  initialMovie?: SerializedMovie | null;
  onBack: () => void;
  /** After Big Reveal Continue — People Discovery. */
  onContinueToPeople: (movieId: string) => void;
  /** Kick people discovery in parallel while rendering. */
  onRenderStarted?: (movieId: string) => void;
};

type UiPhase = "working" | "ready" | "failed";

/**
 * First-session create: wait for clean photos → queue fast-path movie →
 * education slides with real progress → theatrical Big Reveal.
 */
export function FirstFamilyMovieCreating({
  mediaIds,
  initialMovie = null,
  onBack,
  onContinueToPeople,
  onRenderStarted,
}: Props) {
  const [uiPhase, setUiPhase] = useState<UiPhase>(
    initialMovie?.status === "ready" ? "ready" : "working",
  );
  const [runKey, setRunKey] = useState(0);
  const [progress, setProgress] = useState(initialMovie?.status === "ready" ? 100 : 8);
  const [statusLabel, setStatusLabel] = useState(
    initialMovie?.status === "ready"
      ? "Your movie is ready"
      : "Checking your photos…",
  );
  const [error, setError] = useState<string | null>(null);
  const [movie, setMovie] = useState<SerializedMovie | null>(initialMovie);
  const startedRef = useRef(Boolean(initialMovie?.status === "ready"));
  const movieIdRef = useRef<string | null>(initialMovie?.id ?? null);
  const startMsRef = useRef(Date.now());
  const cancelledRef = useRef(false);
  const renderCompletedRef = useRef(initialMovie?.status === "ready");
  const renderStartedNotified = useRef(false);

  const markRevealSeen = useCallback(async () => {
    try {
      await fetch("/api/first-family-movie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reveal-seen" }),
      });
    } catch {
      // Non-fatal — completion still stamps later.
    }
  }, []);

  useEffect(() => {
    if (uiPhase === "ready") return;
    startMsRef.current = Date.now();
    let alive = true;

    const progressTimer = window.setInterval(() => {
      if (!alive) return;
      setProgress((p) => {
        if (p >= 94) return p;
        const elapsed = Date.now() - startMsRef.current;
        const target = 10 + Math.min(82, (elapsed / 45_000) * 82);
        return p < target ? p + Math.max(0.35, (target - p) * 0.1) : p;
      });
    }, 250);

    return () => {
      alive = false;
      window.clearInterval(progressTimer);
    };
  }, [uiPhase]);

  useEffect(() => {
    if (uiPhase === "ready" && runKey === 0) return;
    cancelledRef.current = false;
    // Allow Try again to re-enter the create loop.
    if (runKey > 0) {
      startedRef.current = false;
      movieIdRef.current = null;
      renderCompletedRef.current = false;
      renderStartedNotified.current = false;
    }
    if (startedRef.current) return;
    startedRef.current = true;

    async function countCleanPhotos(ids: string[]): Promise<number> {
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetch(`/api/media/${id}/status`);
            if (!res.ok) return false;
            const body = (await res.json()) as { cleanReady?: boolean };
            return Boolean(body.cleanReady);
          } catch {
            return false;
          }
        }),
      );
      return results.filter(Boolean).length;
    }

    async function pollMovie(movieId: string) {
      setStatusLabel("Crafting your first family movie…");
      while (!cancelledRef.current) {
        try {
          const res = await fetch(`/api/movies/${movieId}`);
          const data = (await res.json().catch(() => ({}))) as {
            movie?: SerializedMovie;
          };
          if (cancelledRef.current) return;
          if (res.ok && data.movie) {
            setMovie(data.movie);
            if (data.movie.status === "ready") {
              setProgress(100);
              setStatusLabel("Your movie is ready");
              storeLastSimpleModeMusicTrackId(
                data.movie.settings?.musicTrackId ?? null,
              );
              if (!renderCompletedRef.current) {
                renderCompletedRef.current = true;
                trackFirstMovieEvent("first_movie_render_completed", {
                  movieId: data.movie.id,
                });
              }
              setUiPhase("ready");
              return;
            }
            if (data.movie.status === "failed") {
              setError(
                data.movie.errorMessage ||
                  "Something went wrong crafting your movie.",
              );
              setUiPhase("failed");
              return;
            }
            if (data.movie.status === "rendering") {
              setStatusLabel("Adding soft transitions and music…");
            }
          }
        } catch {
          // keep polling
        }
        await sleep(1800);
      }
    }

    async function start() {
      setStatusLabel("Waiting for photos to finish safety checks…");
      for (let i = 0; i < 90 && !cancelledRef.current; i++) {
        const clean = await countCleanPhotos(mediaIds);
        setStatusLabel(
          clean >= FFM_SOFT_MIN_PHOTOS
            ? "Photos ready — starting your movie…"
            : `Preparing photos (${clean}/${FFM_SOFT_MIN_PHOTOS})…`,
        );
        if (clean >= FFM_SOFT_MIN_PHOTOS) break;
        await sleep(1800);
      }
      if (cancelledRef.current) return;

      let lastError: string | null = null;
      for (let attempt = 0; attempt < 16 && !cancelledRef.current; attempt++) {
        try {
          const res = await fetch("/api/first-family-movie", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "create-movie",
              mediaIds,
            }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            phase?: string;
            movie?: SerializedMovie;
            cleanCount?: number;
            needed?: number;
            error?: string;
            code?: string;
          };

          if (cancelledRef.current) return;

          if (res.status === 202 || data.phase === "awaiting_media") {
            setStatusLabel(
              `Preparing photos (${data.cleanCount ?? 0}/${data.needed ?? FFM_SOFT_MIN_PHOTOS})…`,
            );
            await sleep(2000);
            continue;
          }

          if (!res.ok || !data.movie) {
            lastError = userFacingApiError(
              data,
              "Could not start your first movie.",
            );
            await sleep(2000);
            continue;
          }

          movieIdRef.current = data.movie.id;
          setMovie(data.movie);
          if (!renderStartedNotified.current) {
            renderStartedNotified.current = true;
            onRenderStarted?.(data.movie.id);
          }
          await pollMovie(data.movie.id);
          return;
        } catch (err) {
          lastError =
            err instanceof Error
              ? err.message
              : "Could not start your first movie.";
          await sleep(2000);
        }
      }

      if (!cancelledRef.current && !movieIdRef.current) {
        setError(
          lastError ||
            "Your photos are still being checked. We’ll keep them safe — try again in a moment.",
        );
        setUiPhase("failed");
      }
    }

    void start();
    return () => {
      cancelledRef.current = true;
    };
  }, [mediaIds, onRenderStarted, runKey, uiPhase]);

  if (uiPhase === "ready" && movie) {
    return (
      <FirstFamilyMovieReveal
        movie={movie}
        onContinue={() => {
          void markRevealSeen();
          onContinueToPeople(movie.id);
        }}
      />
    );
  }

  if (uiPhase === "failed") {
    return (
      <main className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6 py-14 sm:px-8">
        <h1 className="font-display text-2xl tracking-tight text-[color:var(--ink)]">
          We couldn’t finish just yet
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[color:var(--ink-muted)]">
          {error || "Something went wrong while crafting your movie."}
        </p>
        <p className="mt-2 text-sm text-[color:var(--ink-muted)]">
          Your photos are safe. You can try again — we’ll pick up where you
          left off.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onBack}
            className="ui-btn ui-btn-primary inline-flex h-11 items-center justify-center px-5 text-sm font-semibold"
          >
            Back to photos
          </button>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setProgress(8);
              setStatusLabel("Checking your photos…");
              setUiPhase("working");
              setRunKey((k) => k + 1);
            }}
            className="ui-btn ui-btn-secondary inline-flex h-11 items-center justify-center px-5 text-sm font-semibold"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  return (
    <FirstFamilyMovieWaitSlideshow
      progress={progress}
      statusLabel={statusLabel}
    />
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
