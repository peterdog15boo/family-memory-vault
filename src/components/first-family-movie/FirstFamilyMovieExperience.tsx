"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FirstFamilyMovieCelebration } from "@/components/first-family-movie/FirstFamilyMovieCelebration";
import { FirstFamilyMovieCollageBackdrop } from "@/components/first-family-movie/FirstFamilyMovieCollageBackdrop";
import { FirstFamilyMovieCreating } from "@/components/first-family-movie/FirstFamilyMovieCreating";
import { FirstFamilyMovieGuidedUpload } from "@/components/first-family-movie/FirstFamilyMovieGuidedUpload";
import { FirstFamilyMoviePeopleDiscovery } from "@/components/first-family-movie/FirstFamilyMoviePeopleDiscovery";
import { FirstFamilyMovieSkipButton } from "@/components/first-family-movie/FirstFamilyMovieSkipButton";
import { FirstFamilyMovieWelcome } from "@/components/first-family-movie/FirstFamilyMovieWelcome";
import { usePrefersReducedMotion } from "@/components/media-section/usePrefersReducedMotion";
import { trackFirstMovieEvent } from "@/lib/first-family-movie/track-client";
import type { SerializedMovie } from "@/lib/movies/serialize";
import { cn } from "@/lib/utils";

type Step =
  | "welcome"
  | "upload"
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

const COLLAGE_STEPS: ReadonlySet<Step> = new Set([
  "welcome",
  "upload",
  "creating",
]);

const STEP_FADE_MS = 520;

/**
 * First-session “Your First Family Movie” —
 * welcome → upload (auto-starts at 5+) → create (+ parallel faces) →
 * reveal → people → celebration.
 *
 * Collage backdrop mounts once and keeps panning across early ritual steps;
 * overlays crossfade so the experience feels continuous.
 */
export function FirstFamilyMovieExperience({
  storageBlocked = false,
  planName = "your",
  resumeMovie = null,
  localPreview = false,
}: Props) {
  const router = useRouter();
  const reduceMotion = usePrefersReducedMotion();
  const [step, setStep] = useState<Step>(
    resumeMovie?.status === "ready" ? "creating" : "welcome",
  );
  const [renderStep, setRenderStep] = useState<Step>(
    resumeMovie?.status === "ready" ? "creating" : "welcome",
  );
  const [overlayPhase, setOverlayPhase] = useState<"in" | "out">("in");
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [skipPending, setSkipPending] = useState(false);
  const [revealActive, setRevealActive] = useState(
    resumeMovie?.status === "ready",
  );
  const completionSent = useRef(false);
  const peopleWarmRef = useRef(false);

  useEffect(() => {
    if (step === renderStep) return;
    if (reduceMotion) {
      setRenderStep(step);
      setOverlayPhase("in");
      return;
    }
    setOverlayPhase("out");
    const t = window.setTimeout(() => {
      setRenderStep(step);
      setOverlayPhase("in");
    }, STEP_FADE_MS);
    return () => window.clearTimeout(t);
  }, [step, renderStep, reduceMotion]);

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

  const skipRitual = useCallback(async () => {
    if (skipPending) return;
    setSkipPending(true);
    try {
      if (localPreview) {
        router.replace("/dashboard");
        router.refresh();
        return;
      }
      const res = await fetch("/api/first-family-movie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "skip" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        redirectTo?: string;
      };
      if (!res.ok) {
        setSkipPending(false);
        return;
      }
      router.replace(data.redirectTo || "/dashboard");
      router.refresh();
    } catch {
      setSkipPending(false);
    }
  }, [localPreview, router, skipPending]);

  const showStepSkip =
    renderStep === "upload" ||
    renderStep === "creating" ||
    renderStep === "people";

  const showCollage =
    (COLLAGE_STEPS.has(step) || COLLAGE_STEPS.has(renderStep)) &&
    !revealActive;

  useEffect(() => {
    if (step !== "celebrate") return;
    void persistCompletion();
  }, [step, persistCompletion]);

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
    <div
      className={cn(
        "ffm-shell relative min-h-dvh overflow-hidden text-[color:var(--ink)]",
        showCollage ? "bg-[#0c0a09]" : "bg-[color:var(--canvas)]",
      )}
    >
      {localPreview ? (
        <p
          className="pointer-events-none absolute left-3 top-3 z-50 rounded-md bg-black/55 px-2.5 py-1 font-sans text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[#e8c9a4] backdrop-blur-sm"
          aria-label="Local preview mode"
        >
          Local preview
        </p>
      ) : null}

      <div
        className={cn(
          "ffm-backdrop-fade absolute inset-0 z-0 min-h-[100dvh] w-full",
          !showCollage && "ffm-backdrop-fade--hidden",
        )}
        aria-hidden={!showCollage}
      >
        {(COLLAGE_STEPS.has(step) || COLLAGE_STEPS.has(renderStep)) && (
          <FirstFamilyMovieCollageBackdrop
            denserVeil={renderStep !== "welcome"}
          />
        )}
      </div>

      {!showCollage ? (
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

      {showStepSkip && !revealActive ? (
        <div
          className={cn(
            "absolute z-50",
            localPreview
              ? "right-3 top-12 sm:right-5"
              : "right-3 top-3 sm:right-5 sm:top-5",
          )}
        >
          <FirstFamilyMovieSkipButton
            variant="header"
            onClick={() => {
              void skipRitual();
            }}
            pending={skipPending}
            className="border-white/20 bg-black/35 text-[#f7f0e8] hover:bg-black/50"
          />
        </div>
      ) : null}

      <div
        className={cn(
          "ffm-step-overlay",
          overlayPhase === "in" ? "ffm-step-overlay--in" : "ffm-step-overlay--out",
        )}
      >
        {renderStep === "welcome" ? (
          <FirstFamilyMovieWelcome
            onStart={() => setStep("upload")}
            onSkip={() => {
              void skipRitual();
            }}
            skipPending={skipPending}
          />
        ) : renderStep === "upload" ? (
          <FirstFamilyMovieGuidedUpload
            storageBlocked={storageBlocked}
            planName={planName}
            initialMediaIds={mediaIds}
            onBack={() => setStep("welcome")}
            onReady={(ids) => {
              setMediaIds(ids);
              warmPeopleDiscovery(ids);
              setStep("creating");
            }}
            onSkip={() => {
              void skipRitual();
            }}
            skipPending={skipPending}
          />
        ) : renderStep === "creating" ? (
          <FirstFamilyMovieCreating
            mediaIds={mediaIds}
            initialMovie={resumeMovie}
            onBack={() => setStep("upload")}
            onRenderStarted={() => warmPeopleDiscovery(mediaIds)}
            onRevealStart={() => setRevealActive(true)}
            onContinueToPeople={() => {
              setRevealActive(false);
              setStep("people");
            }}
            onSkip={() => {
              void skipRitual();
            }}
            skipPending={skipPending}
          />
        ) : renderStep === "people" ? (
          <FirstFamilyMoviePeopleDiscovery
            mediaIds={mediaIds}
            onContinue={() => setStep("celebrate")}
            onSkip={() => {
              void skipRitual();
            }}
            skipPending={skipPending}
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
    </div>
  );
}
