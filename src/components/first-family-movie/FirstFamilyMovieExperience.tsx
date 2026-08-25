"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FirstFamilyMovieCelebration } from "@/components/first-family-movie/FirstFamilyMovieCelebration";
import { FirstFamilyMovieCreating } from "@/components/first-family-movie/FirstFamilyMovieCreating";
import { FirstFamilyMovieGuidedUpload } from "@/components/first-family-movie/FirstFamilyMovieGuidedUpload";
import { FirstFamilyMoviePeopleDiscovery } from "@/components/first-family-movie/FirstFamilyMoviePeopleDiscovery";
import { FirstFamilyMovieWelcome } from "@/components/first-family-movie/FirstFamilyMovieWelcome";
import { trackFirstMovieEvent } from "@/lib/first-family-movie/track-client";
import type { SerializedMovie } from "@/lib/movies/serialize";

type Step =
  | "welcome"
  | "upload"
  | "photos-ready"
  | "creating"
  | "people"
  | "celebrate";

type Props = {
  storageBlocked?: boolean;
  planName?: string;
  /** Resume Big Reveal when notification / refresh brings the user back. */
  resumeMovie?: SerializedMovie | null;
  /** Development-only: skip completion writes so existing accounts can re-test. */
  localPreview?: boolean;
};

/**
 * First-session “Your First Family Movie” —
 * welcome → upload → create (+ parallel faces) → reveal → people → celebration.
 */
export function FirstFamilyMovieExperience({
  storageBlocked = false,
  planName = "your",
  resumeMovie = null,
  localPreview = false,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(
    resumeMovie?.status === "ready" ? "creating" : "welcome",
  );
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const completionSent = useRef(false);
  const peopleWarmRef = useRef(false);

  const persistCompletion = useCallback(async () => {
    if (localPreview || completionSent.current) return;
    completionSent.current = true;
    try {
      await fetch("/api/first-family-movie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", trackFunnel: true }),
      });
    } catch {
      completionSent.current = false;
    }
  }, [localPreview]);

  useEffect(() => {
    if (step !== "celebrate") return;
    void persistCompletion();
  }, [step, persistCompletion]);

  // Warm people discovery while the movie renders (faces run in parallel).
  const warmPeopleDiscovery = useCallback((ids: string[]) => {
    if (peopleWarmRef.current || ids.length === 0) return;
    peopleWarmRef.current = true;
    void fetch("/api/first-family-movie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "discover-people", mediaIds: ids }),
    }).catch(() => {
      peopleWarmRef.current = false;
    });
  }, []);

  const goToApp = useCallback(
    async (path: string) => {
      await persistCompletion();
      router.replace(path);
      router.refresh();
    },
    [persistCompletion, router],
  );

  return (
    <div className="ffm-shell relative min-h-dvh overflow-hidden bg-[color:var(--canvas)] text-[color:var(--ink)]">
      {localPreview ? (
        <p
          className="pointer-events-none absolute left-3 top-3 z-50 rounded-md bg-black/55 px-2.5 py-1 font-sans text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[#e8c9a4] backdrop-blur-sm"
          aria-label="Local preview mode"
        >
          Local preview
        </p>
      ) : null}

      {step !== "welcome" ? (
        <>
          <div
            className="page-atmosphere pointer-events-none absolute inset-0"
            aria-hidden
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.45]"
            style={{
              background:
                "radial-gradient(ellipse 90% 55% at 50% -15%, var(--atmosphere-a), transparent 58%), radial-gradient(ellipse 55% 40% at 100% 100%, var(--atmosphere-b), transparent 52%), radial-gradient(ellipse 40% 30% at 0% 80%, var(--warm-glow), transparent 55%)",
            }}
          />
        </>
      ) : null}

      {step === "welcome" ? (
        <FirstFamilyMovieWelcome onStart={() => setStep("upload")} />
      ) : step === "upload" ? (
        <FirstFamilyMovieGuidedUpload
          storageBlocked={storageBlocked}
          planName={planName}
          initialMediaIds={mediaIds}
          onBack={() => setStep("welcome")}
          onContinue={(ids) => {
            setMediaIds(ids);
            setStep("photos-ready");
          }}
        />
      ) : step === "photos-ready" ? (
        <PhotosReadyStep
          count={mediaIds.length}
          onAddMore={() => setStep("upload")}
          onCreate={() => {
            trackFirstMovieEvent("first_movie_create_clicked", {
              mediaCount: mediaIds.length,
            });
            warmPeopleDiscovery(mediaIds);
            setStep("creating");
          }}
        />
      ) : step === "creating" ? (
        <FirstFamilyMovieCreating
          mediaIds={mediaIds}
          initialMovie={resumeMovie}
          onBack={() => setStep("photos-ready")}
          onRenderStarted={() => warmPeopleDiscovery(mediaIds)}
          onContinueToPeople={() => setStep("people")}
        />
      ) : step === "people" ? (
        <FirstFamilyMoviePeopleDiscovery
          mediaIds={mediaIds}
          onContinue={() => setStep("celebrate")}
        />
      ) : (
        <FirstFamilyMovieCelebration
          onAddPhotos={() => {
            trackFirstMovieEvent("first_movie_add_more_clicked");
            void goToApp("/upload");
          }}
          onInviteFamily={() => {
            trackFirstMovieEvent("first_movie_invite_clicked");
            void goToApp("/family");
          }}
          onEnterApp={() => {
            void goToApp("/media");
          }}
        />
      )}
    </div>
  );
}

function PhotosReadyStep({
  count,
  onAddMore,
  onCreate,
}: {
  count: number;
  onAddMore: () => void;
  onCreate: () => void;
}) {
  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-6 py-14 sm:px-8">
      <p className="font-sans text-[0.6875rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-deep)]">
        Photos ready
      </p>
      <h1 className="mt-6 font-display text-[clamp(1.75rem,6vw,2.4rem)] leading-tight tracking-tight text-[color:var(--ink)]">
        {count} favorite{count === 1 ? "" : "s"} are safely in your vault.
      </h1>
      <p className="mt-4 text-base leading-relaxed text-[color:var(--ink-muted)]">
        We’ll arrange them with soft transitions, face-aware framing, and a
        gentle soundtrack — no black title card.
      </p>
      <div className="mt-10 flex flex-col gap-3">
        <button
          type="button"
          onClick={onCreate}
          className="ui-btn ui-btn-primary inline-flex h-12 w-full items-center justify-center px-6 text-base font-semibold"
        >
          Create My Movie
        </button>
        <button
          type="button"
          onClick={onAddMore}
          className="ui-btn ui-btn-secondary inline-flex h-11 w-full items-center justify-center px-5 text-sm font-semibold"
        >
          Add more photos
        </button>
      </div>
    </main>
  );
}
