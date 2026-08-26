"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Download,
  Film,
  Loader2,
  Play,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import { UpgradePrompt } from "@/components/billing/UpgradePrompt";
import { HintTooltip } from "@/components/ui/HintTooltip";
import { USAGE_WARNING_PERCENT } from "@/lib/billing/usage-thresholds";
import { useCopy, useTranslations } from "@/components/i18n/LocaleProvider";
import { announce } from "@/lib/a11y/announce";
import { useAnnounceStatus } from "@/hooks/useAnnounceStatus";
import type { MovieStyle } from "@/lib/db/schema";
import type { SerializedMovie } from "@/lib/movies/serialize";
import {
  MOVIE_PRESETS,
  getMoviePreset,
  type MoviePresetId,
} from "@/lib/movies/presets";
import {
  buildSimpleModeSettings,
  readLastSimpleModeMusicTrackId,
  readStoredMovieCreateMode,
  storeLastSimpleModeMusicTrackId,
  storeMovieCreateMode,
  type MovieCreateMode,
} from "@/lib/movies/simple-mode";
import {
  aspectRatioHint,
  resolveMovieOutputSpec,
} from "@/lib/movies/output";
import type {
  ColorFilterId,
  ColorFilterIntensity,
  MovieAspectRatio,
  MovieTransition,
  QualityMode,
  ZoomIntensity,
} from "@/lib/movies/settings";
import { ensureFaceAwareMovieSettings } from "@/lib/movies/settings";
import {
  COLOR_FILTER_CATALOG,
  type ColorFilterDefinition,
} from "@/lib/movies/filters";
import {
  TRANSITION_CATALOG,
  type TransitionCatalogEntry,
} from "@/lib/movies/transition-catalog";
import {
  downloadMovieFile,
  movieAspectClass,
  movieAspectFromSettings,
} from "@/lib/movies/share";
import type { PlanCapabilities } from "@/lib/plans/gates";
import { userFacingApiError } from "@/lib/http/user-messages";
import { cn } from "@/lib/utils";
import {
  MovieMusicPicker,
  type MovieMusicSelection,
} from "@/components/movies/MovieMusicPicker";
import { MoviePlayer } from "@/components/movies/MoviePlayer";
import { MovieShareDialog } from "@/components/movies/MovieShareDialog";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import {
  getLibraryTrack,
  resolveSuggestionToLibraryId,
} from "@/lib/movies/music/library";
import { estimateMovieRenderTime } from "@/lib/movies/estimate";
import { beginCriticalWork } from "@/lib/session/critical-activity";

/** Panel accent colors keyed by movie style (presets set style; no theme picker). */
const THEME_ACCENTS: Record<MovieStyle, string> = {
  simple: "#4a7c6f",
  holiday: "#a63d3d",
  cinematic: "#5c5346",
  vintage: "#8b6914",
  bright: "#5a8fa8",
  birthday: "#c47a2c",
};

const ADVANCED_STYLES = new Set<MovieStyle>(["cinematic", "vintage"]);

const FILTER_INTENSITY_OPTIONS: {
  id: ColorFilterIntensity;
  label: string;
}[] = [
  { id: "subtle", label: "Subtle" },
  { id: "medium", label: "Medium" },
  { id: "strong", label: "Strong" },
];

const COLOR_FILTERS_UI: ColorFilterDefinition[] = [...COLOR_FILTER_CATALOG];

const TRANSITIONS: TransitionCatalogEntry[] = TRANSITION_CATALOG.filter(
  (t) => t.id !== "none",
).concat(TRANSITION_CATALOG.filter((t) => t.id === "none"));

const TRANSITION_DURATION_OPTIONS: {
  id: "auto" | "short" | "medium" | "long";
  label: string;
  hint: string;
  ms: number | null;
}[] = [
  { id: "auto", label: "Auto", hint: "Suggested", ms: null },
  { id: "short", label: "Short", hint: "~0.35s", ms: 350 },
  { id: "medium", label: "Medium", hint: "~0.6s", ms: 600 },
  { id: "long", label: "Long", hint: "~1s", ms: 1000 },
];

const ZOOM_OPTIONS: { id: ZoomIntensity; label: string }[] = [
  { id: "subtle", label: "Subtle" },
  { id: "medium", label: "Medium" },
  { id: "strong", label: "Strong" },
];

const ZOOM_DIRECTIONS: {
  id: "alternate" | "always-in" | "always-out";
  label: string;
}[] = [
  { id: "alternate", label: "Alternate" },
  { id: "always-in", label: "Always in" },
  { id: "always-out", label: "Always out" },
];

const PACING: {
  id: string;
  label: string;
  hint: string;
  targetDurationSeconds: number;
  photoDurationMs: number;
}[] = [
  {
    id: "short",
    label: "Short",
    hint: "~25 sec",
    targetDurationSeconds: 25,
    photoDurationMs: 2200,
  },
  {
    id: "medium",
    label: "Medium",
    hint: "~45 sec",
    targetDurationSeconds: 45,
    photoDurationMs: 3200,
  },
  {
    id: "longer",
    label: "Longer",
    hint: "~60 sec",
    targetDurationSeconds: 60,
    photoDurationMs: 4200,
  },
];

const ASPECT_OPTIONS: {
  id: MovieAspectRatio;
  label: string;
  short: string;
}[] = [
  { id: "16:9", label: "Landscape", short: "16:9" },
  { id: "1:1", label: "Square", short: "1:1" },
  { id: "9:16", label: "Vertical", short: "9:16" },
];

const QUALITY_OPTIONS: {
  id: QualityMode;
  label: string;
  hint: string;
  premium?: boolean;
}[] = [
  { id: "fast", label: "Fast", hint: "~720p" },
  { id: "standard", label: "1080p", hint: "Share-ready" },
  {
    id: "ultra",
    label: "4K",
    hint: "Maximum",
    premium: true,
  },
];

const DEFAULT_MUSIC: MovieMusicSelection = {
  musicSource: "none",
  musicTrackId: null,
  musicUploadKey: null,
  musicLabel: null,
  musicSuggestionId: null,
  musicVolume: 0.55,
  musicFadeInMs: 1500,
  musicFadeOutMs: 2500,
  musicLoop: true,
  musicAiGenerated: false,
  musicAiProvider: null,
};

type PanelPhase = "compose" | "crafting" | "ready" | "failed";

type CreateMoviePanelProps = {
  memoryId: string;
  memoryTitle: string;
  mediaCount: number;
  capabilities: PlanCapabilities;
  onClose: () => void;
  /**
   * Forced starting mode for this open (Make Movie → Simple).
   * When omitted, last stored preference is used (default Simple for new users).
   */
  defaultCreateMode?: MovieCreateMode;
};

export function CreateMoviePanel({
  memoryId,
  memoryTitle,
  mediaCount,
  capabilities,
  onClose,
  defaultCreateMode,
}: CreateMoviePanelProps) {
  const copy = useCopy();
  const t = useTranslations();
  const [themeId, setThemeId] = useState<MovieStyle>("simple");
  const [title, setTitle] = useState(memoryTitle);
  const [includeTitles, setIncludeTitles] = useState(false);
  const [pacingId, setPacingId] = useState("medium");
  const [transition, setTransition] = useState<MovieTransition>("soft_dissolve");
  const [transitionDurationId, setTransitionDurationId] = useState<
    "auto" | "short" | "medium" | "long"
  >("medium");
  const [zoomIntensity, setZoomIntensity] =
    useState<ZoomIntensity>("medium");
  const [zoomDirection, setZoomDirection] =
    useState<"alternate" | "always-in" | "always-out">("alternate");
  const [presetId, setPresetId] = useState<MoviePresetId | null>("simple_mode");
  const [music, setMusic] = useState<MovieMusicSelection>({
    ...DEFAULT_MUSIC,
    musicSource: "library",
    musicTrackId: "soft-piano",
    musicSuggestionId: "soft-piano",
  });
  const [aspectRatio, setAspectRatio] = useState<MovieAspectRatio>("16:9");
  const [qualityMode, setQualityMode] = useState<QualityMode>("standard");
  const [colorFilter, setColorFilter] = useState<ColorFilterId>("warm_family");
  const [colorFilterIntensity, setColorFilterIntensity] =
    useState<ColorFilterIntensity>("subtle");
  /** null = use the filter's own grain/vignette amounts. */
  const [filterGrain, setFilterGrain] = useState<boolean | null>(false);
  const [filterVignette, setFilterVignette] = useState<boolean | null>(false);
  const [createMode, setCreateMode] = useState<MovieCreateMode>(
    () => defaultCreateMode ?? "simple",
  );
  const [phase, setPhase] = useState<PanelPhase>("compose");
  const [movie, setMovie] = useState<SerializedMovie | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [mounted, setMounted] = useState(false);
  const announcedPhaseRef = useRef<PanelPhase>("compose");

  useAnnounceStatus(error, { priority: "assertive" });

  useEffect(() => {
    // Prefer an explicit open mode (e.g. Make Movie → Simple); else remember last choice.
    if (defaultCreateMode) {
      setCreateMode(defaultCreateMode);
      storeMovieCreateMode(defaultCreateMode);
      return;
    }
    setCreateMode(readStoredMovieCreateMode());
  }, [defaultCreateMode]);

  function setMode(next: MovieCreateMode) {
    setCreateMode(next);
    storeMovieCreateMode(next);
    if (next === "simple") {
      applyPreset("simple_mode");
    }
  }

  useEffect(() => {
    if (phase === announcedPhaseRef.current) return;
    announcedPhaseRef.current = phase;
    if (phase === "crafting") {
      announce(t("a11y.movieCreating"), { priority: "polite" });
    } else if (phase === "ready") {
      announce(t("a11y.movieReady"), { priority: "polite" });
    } else if (phase === "failed") {
      announce(t("a11y.movieFailed"), { priority: "assertive" });
    }
  }, [phase, t]);

  const canCreate = capabilities.movies.allowed;
  const advancedThemes = capabilities.advancedThemes;
  const canUltra = capabilities.priorityRender;
  const moviesUsed = capabilities.movies.used;
  const moviesLimit = capabilities.movies.limit ?? capabilities.maxMoviesPerMonth;
  const moviesNearLimit =
    canCreate &&
    moviesUsed != null &&
    moviesLimit != null &&
    moviesLimit > 0 &&
    moviesUsed / moviesLimit >= USAGE_WARNING_PERCENT / 100;

  const panelAccent = THEME_ACCENTS[themeId] ?? THEME_ACCENTS.simple;

  const outputPreview = useMemo(
    () =>
      resolveMovieOutputSpec({
        aspectRatio,
        qualityMode,
        allowUltra: canUltra,
      }),
    [aspectRatio, qualityMode, canUltra],
  );

  const pacing = useMemo(
    () => PACING.find((p) => p.id === pacingId) ?? PACING[1]!,
    [pacingId],
  );

  const suggestedMusicIds = useMemo(() => {
    const map: Record<MovieStyle, string[]> = {
      simple: ["soft-piano", "gentle-acoustic", "family-porch"],
      holiday: ["festive-strings", "carol-lite", "holiday-glow"],
      cinematic: ["quiet-score", "ambient-pads", "film-rise"],
      vintage: ["vinyl-soft", "soft-farewell"],
      bright: ["social-spark", "feed-ready", "light-ukulele"],
      birthday: ["upbeat-pop", "sunny-stride", "bright-scroll"],
    };
    return (map[themeId] ?? [])
      .map((id) => resolveSuggestionToLibraryId(id) ?? id)
      .filter(Boolean);
  }, [themeId]);

  const clearPreset = useCallback(() => {
    setPresetId(null);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // Keep idle logout aware of an in-flight render (warn, then still force if ignored).
  const endMovieRenderRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const rendering =
      movie?.status === "queued" ||
      movie?.status === "processing" ||
      phase === "crafting";
    if (rendering && !endMovieRenderRef.current) {
      endMovieRenderRef.current = beginCriticalWork("movie_render");
    } else if (!rendering && endMovieRenderRef.current) {
      endMovieRenderRef.current();
      endMovieRenderRef.current = null;
    }
  }, [movie?.status, phase]);
  useEffect(
    () => () => {
      endMovieRenderRef.current?.();
      endMovieRenderRef.current = null;
    },
    [],
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const panelRef = useRef<HTMLDivElement>(null);

  useOverlayA11y({
    open: mounted,
    onClose,
    containerRef: panelRef,
    lockScrollPadding: true,
  });

  const pollMovie = useCallback(
    async (movieId: string) => {
      try {
        const response = await fetch(`/api/movies/${movieId}`);
        const data = (await response.json().catch(() => ({}))) as {
          movie?: SerializedMovie;
          error?: string;
        };
        if (!response.ok || !data.movie) {
          throw new Error(data.error || t("movie.errorCheckMovieStatus"));
        }
        setMovie(data.movie);
        if (data.movie.status === "ready") {
          stopPolling();
          setPhase("ready");
          setError(null);
        } else if (data.movie.status === "failed") {
          stopPolling();
          setPhase("failed");
          setError(
            data.movie.errorMessage ||
              "Something went wrong while crafting your movie. You can try again.",
          );
        } else {
          setPhase("crafting");
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : t("movie.errorCheckMovieStatus"),
        );
      }
    },
    [stopPolling, t],
  );

  const startPolling = useCallback(
    (movieId: string) => {
      stopPolling();
      void pollMovie(movieId);
      pollRef.current = setInterval(() => {
        void pollMovie(movieId);
      }, 2500);
    },
    [pollMovie, stopPolling],
  );

  function applyPreset(id: MoviePresetId) {
    const preset = getMoviePreset(id);
    if (!preset) return;
    if (ADVANCED_STYLES.has(preset.style) && !advancedThemes) {
      setUpgradeMessage(
        "This preset uses an advanced theme. Upgrade to Family to unlock it.",
      );
      return;
    }
    setUpgradeMessage(null);
    setPresetId(id);
    setThemeId(preset.style);
    setAspectRatio(preset.aspectRatio);
    setTransition(preset.transition);
    setTransitionDurationId("auto");
    setZoomIntensity(preset.zoomIntensity === "off" ? "medium" : preset.zoomIntensity);
    setZoomDirection(
      preset.zoomDirection === "off" ? "alternate" : preset.zoomDirection,
    );
    setIncludeTitles(preset.includeTitles);
    setColorFilter(preset.colorFilter);
    setColorFilterIntensity(preset.colorFilterIntensity);
    setFilterGrain(preset.filterGrain);
    setFilterVignette(preset.filterVignette);

    let nextQuality = preset.qualityMode;
    if (nextQuality === "ultra" && !canUltra) {
      nextQuality = "standard";
    }
    setQualityMode(nextQuality);

    const match = PACING.find(
      (p) =>
        Math.abs(p.photoDurationMs - preset.photoDurationMs) < 400 &&
        Math.abs(p.targetDurationSeconds - preset.targetDurationSeconds) < 12,
    );
    if (match) {
      setPacingId(match.id);
    } else {
      setPacingId(
        preset.photoDurationMs <= 2400
          ? "short"
          : preset.photoDurationMs >= 4000
            ? "longer"
            : "medium",
      );
    }

    if (preset.musicSource === "library" && preset.musicTrackId) {
      const track = getLibraryTrack(preset.musicTrackId);
      setMusic({
        ...DEFAULT_MUSIC,
        musicSource: "library",
        musicTrackId: track?.id ?? preset.musicTrackId,
        musicLabel: track?.label ?? null,
        musicSuggestionId: track?.id ?? preset.musicTrackId,
      });
    }
    // If the preset has no soundtrack, keep the user's current music pick.
  }

  async function handleCreate() {
    if (mediaCount === 0) {
      setError(copy.movie.emptyMedia);
      return;
    }
    if (!canCreate) {
      setUpgradeMessage(
        capabilities.movies.reason ??
          "You've reached your movie limit for this plan.",
      );
      return;
    }

    const isSimple = createMode === "simple";

    if (!isSimple && ADVANCED_STYLES.has(themeId) && !advancedThemes) {
      setUpgradeMessage(
        "Cinematic and Vintage themes require a Family plan or higher.",
      );
      return;
    }
    if (!isSimple && qualityMode === "ultra" && !canUltra) {
      setUpgradeMessage(
        "Ultra 4K exports require Family Plus or higher.",
      );
      return;
    }
    setError(null);
    setUpgradeMessage(null);
    setSubmitting(true);

    try {
      let body: Record<string, unknown>;

      if (isSimple) {
        const simpleSettings = buildSimpleModeSettings({
          excludeTrackId: readLastSimpleModeMusicTrackId(),
        });
        body = {
          autoTitle: true,
          style: "simple",
          settings: simpleSettings,
        };
      } else {
        const preset = presetId ? getMoviePreset(presetId) : null;
        const durationOpt = TRANSITION_DURATION_OPTIONS.find(
          (d) => d.id === transitionDurationId,
        );
        const transitionDurationMs =
          transition === "none" ? null : (durationOpt?.ms ?? null);
        const faceAwareMotion = ensureFaceAwareMovieSettings({
          zoomIntensity,
          zoomDirection,
          qualityMode,
          photoDurationMs: pacing.photoDurationMs,
        });
        body = {
          title: title.trim() || memoryTitle,
          style: themeId,
          settings: {
            targetDurationSeconds:
              preset?.targetDurationSeconds ?? pacing.targetDurationSeconds,
            photoDurationMs:
              preset?.photoDurationMs ?? pacing.photoDurationMs,
            transition,
            transitionDurationMs,
            zoomIntensity: faceAwareMotion.zoomIntensity,
            zoomDirection: faceAwareMotion.zoomDirection,
            includeTitles,
            posterStyle: includeTitles ? "titled" : "photo",
            aspectRatio,
            presetId,
            qualityMode: faceAwareMotion.qualityMode,
            colorFilter,
            colorFilterIntensity,
            filterGrain,
            filterVignette,
            musicSource: music.musicSource,
            musicTrackId: music.musicTrackId,
            musicUploadKey: music.musicUploadKey,
            musicLabel: music.musicLabel,
            musicSuggestionId: music.musicSuggestionId ?? music.musicTrackId,
            musicVolume: music.musicVolume,
            musicFadeInMs: music.musicFadeInMs,
            musicFadeOutMs: music.musicFadeOutMs,
            musicLoop: music.musicLoop,
            musicAiGenerated: music.musicAiGenerated,
            musicAiProvider: music.musicAiProvider,
          },
        };
      }

      const response = await fetch(`/api/memories/${memoryId}/movies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as {
        movie?: SerializedMovie;
        error?: string;
        code?: string;
      };
      if (!response.ok || !data.movie) {
        if (data.code === "plan_limit" || data.code === "quota_exceeded") {
          setUpgradeMessage(
            userFacingApiError(data, t("movie.errorPlanLimit")),
          );
          setError(null);
          return;
        }
        throw new Error(
          userFacingApiError(data, t("movie.errorStartMovie")),
        );
      }
      setMovie(data.movie);
      if (isSimple) {
        storeLastSimpleModeMusicTrackId(
          data.movie.settings?.musicTrackId ?? null,
        );
      }
      setPhase("crafting");
      startPolling(data.movie.id);
    } catch (err) {
      setPhase("compose");
      setError(
        err instanceof Error ? err.message : t("movie.errorStartMovie"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    stopPolling();
    setMovie(null);
    setError(null);
    setPhase("compose");
  }

  if (!mounted) return null;

  return createPortal(
    <div
      ref={panelRef}
      className="fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto bg-ink/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-movie-title"
      tabIndex={-1}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="movie-panel relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-canvas shadow-[0_-8px_40px_rgba(42,40,37,0.18)] sm:rounded-2xl sm:shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-90"
          aria-hidden
          style={{
            background: `
              radial-gradient(ellipse 80% 50% at 10% -10%, ${panelAccent}22, transparent 55%),
              radial-gradient(ellipse 60% 40% at 100% 0%, rgba(196,168,125,0.16), transparent 50%)
            `,
          }}
        />

        <header className="relative flex items-start justify-between gap-3 border-b border-ink/8 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
              {t("movie.production")}
            </p>
            <h2
              id="create-movie-title"
              className="mt-1 font-display text-2xl tracking-tight text-ink"
            >
              {phase === "ready"
                ? copy.movie.readyTitle
                : phase === "crafting"
                  ? copy.movie.craftingTitle
                  : phase === "failed"
                    ? copy.movie.failedTitle
                    : createMode === "simple"
                      ? t("movie.simpleModeTitle")
                      : t("pages.createMovie")}
              {phase === "compose" && createMode === "expert" ? (
                <span className="ml-1.5 inline-flex align-middle">
                  <HintTooltip tip={copy.tips.createMovie} label={t("pages.aboutMovies")} />
                </span>
              ) : null}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-ink-muted transition hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            aria-label={t("pages.close")}
          >
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div className="relative overflow-y-auto px-5 py-5 sm:px-6">
          {error && phase !== "failed" ? (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {error}
            </p>
          ) : null}

          {moviesNearLimit && phase === "compose" && !upgradeMessage ? (
            <div className="mb-4">
              <UpgradePrompt
                variant="warning"
                message={`You've used ${moviesUsed} of ${moviesLimit} movies this month on ${capabilities.planName}.`}
                hint="Plan ahead for your next memory movie, or upgrade for a higher monthly limit."
                ctaLabel="See plans"
              />
            </div>
          ) : null}

          {upgradeMessage && phase === "compose" ? (
            <div className="mb-4">
              <UpgradePrompt
                variant="blocked"
                message={upgradeMessage}
                hint={capabilities.movies.upgradeHint}
                ctaLabel="Upgrade for more movies"
              />
            </div>
          ) : null}

          {!canCreate && phase === "compose" && !upgradeMessage ? (
            <div className="mb-4">
              <UpgradePrompt
                variant="blocked"
                title="Monthly movie limit reached"
                message={
                  capabilities.movies.reason ??
                  `You've used all your movies this month on ${capabilities.planName}.`
                }
                hint={capabilities.movies.upgradeHint}
                ctaLabel="Upgrade for more movies"
              />
            </div>
          ) : null}

          {phase === "compose" && createMode === "simple" ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-4">
                <p className="font-display text-lg tracking-tight text-ink">
                  {t("movie.simpleModeLead")}
                </p>
                <ul className="mt-3 space-y-1.5 text-sm text-ink-muted">
                  <li>{t("movie.simpleModeBulletSlideshow")}</li>
                  <li>{t("movie.simpleModeBulletMedia", { count: mediaCount })}</li>
                </ul>
              </div>

              {capabilities.movieWatermark ? (
                <p className="text-xs leading-relaxed text-ink-muted">
                  {t("movie.simpleModeWatermarkHint")}
                </p>
              ) : null}

              <p className="text-xs text-ink-muted">
                {estimateMovieRenderTime({
                  photoCount: mediaCount,
                  qualityMode: "standard",
                  hasMusic: true,
                }).label}
                .
              </p>

              <button
                type="button"
                disabled={submitting || mediaCount === 0 || !canCreate}
                onClick={() => void handleCreate()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3.5 text-sm font-medium text-accent-foreground transition hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="size-4" aria-hidden />
                )}
                {submitting
                  ? t("common.starting")
                  : t("movie.createSimpleMovieCta")}
              </button>

              <button
                type="button"
                onClick={() => setMode("expert")}
                className="w-full text-center text-sm font-medium text-ink-muted underline-offset-4 transition hover:text-ink hover:underline"
              >
                {t("movie.expertModeLink")}
              </button>
            </div>
          ) : null}

          {phase === "compose" && createMode === "expert" ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-ink/8 bg-ink/[0.02] px-3 py-2">
                <p className="text-xs text-ink-muted">
                  {t("movie.expertModeBadge")}
                </p>
                <button
                  type="button"
                  onClick={() => setMode("simple")}
                  className="shrink-0 text-xs font-medium text-accent-deep underline-offset-2 hover:underline"
                >
                  {t("movie.simpleModeLink")}
                </button>
              </div>

              {/* 1. Presets */}
              <section>
                <h3 className="text-sm font-medium text-ink">
                  {t("movie.presets")}
                </h3>
                <p className="mt-1 text-sm text-ink-muted">
                  {t("movie.presetsLead")}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {MOVIE_PRESETS.map((preset) => {
                    const selected = presetId === preset.id;
                    const locked =
                      ADVANCED_STYLES.has(preset.style) && !advancedThemes;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPreset(preset.id)}
                        className={cn(
                          "rounded-xl border px-3 py-2.5 text-left transition",
                          selected
                            ? "border-accent/40 bg-accent/10"
                            : "border-ink/10 hover:border-ink/18",
                          locked && "opacity-80",
                        )}
                      >
                        <span className="flex items-center justify-between gap-1">
                          <span className="block font-display text-sm text-ink">
                            {preset.label}
                          </span>
                          {locked ? (
                            <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-900">
                              Family+
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-ink-muted">
                          {preset.blurb}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* 2. Aspect ratio */}
              <section>
                <h3 className="text-sm font-medium text-ink">Aspect ratio</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  {aspectRatioHint(aspectRatio)}
                </p>
                <div className="mt-3 flex gap-2">
                  {ASPECT_OPTIONS.map((opt) => {
                    const selected = aspectRatio === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setAspectRatio(opt.id);
                          clearPreset();
                        }}
                        className={cn(
                          "flex-1 rounded-lg border px-2 py-2.5 text-center transition",
                          selected
                            ? "border-accent/40 bg-accent/10 text-ink"
                            : "border-ink/10 text-ink-muted hover:border-ink/20",
                        )}
                      >
                        <span className="block text-sm font-medium">
                          {opt.short}
                        </span>
                        <span className="block text-[11px] opacity-80">
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* 3. Duration / pacing */}
              <section>
                <h3 className="text-sm font-medium text-ink">
                  Duration / pacing
                </h3>
                <p className="mt-1 text-sm text-ink-muted">
                  Approximate length — we pace stills to fit.
                </p>
                <div className="mt-3 flex gap-2">
                  {PACING.map((p) => {
                    const selected = p.id === pacingId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setPacingId(p.id);
                          clearPreset();
                        }}
                        className={cn(
                          "flex-1 rounded-lg border px-2 py-2.5 text-center transition",
                          selected
                            ? "border-accent/40 bg-accent/10 text-ink"
                            : "border-ink/10 text-ink-muted hover:border-ink/20",
                        )}
                      >
                        <span className="block text-sm font-medium">
                          {p.label}
                        </span>
                        <span className="block text-[11px] opacity-80">
                          {p.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* 4. Title on/off + text */}
              <section>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 id="movie-title-card-label" className="text-sm font-medium text-ink">
                      Title card
                    </h3>
                    <p id="movie-title-card-hint" className="mt-0.5 text-sm text-ink-muted">
                      Show a title at the start of the film.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={includeTitles}
                    aria-labelledby="movie-title-card-label"
                    aria-describedby="movie-title-card-hint"
                    onClick={() => {
                      setIncludeTitles((prev) => !prev);
                      clearPreset();
                    }}
                    className={cn(
                      "relative h-7 w-12 shrink-0 rounded-full border transition",
                      includeTitles
                        ? "border-accent/40 bg-accent/25"
                        : "border-ink/15 bg-ink/8",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 size-5 rounded-full bg-canvas shadow transition",
                        includeTitles ? "left-[22px]" : "left-0.5",
                      )}
                      aria-hidden
                    />
                  </button>
                </div>
                {includeTitles ? (
                  <div className="mt-3">
                    <label htmlFor="movie-title" className="sr-only">
                      Movie title
                    </label>
                    <input
                      id="movie-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      maxLength={200}
                      className="w-full rounded-lg border border-ink/12 bg-canvas px-3 py-2.5 text-sm text-ink outline-none ring-accent/30 transition focus:border-accent/40 focus:ring-2"
                      placeholder="Name this film"
                    />
                  </div>
                ) : null}
              </section>

              {/* 5. Transition pack + duration */}
              <section>
                <h3 className="text-sm font-medium text-ink">Transition pack</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  Clip-to-clip motion — hard cut last if you want none.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {TRANSITIONS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTransition(t.id);
                        clearPreset();
                      }}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left transition",
                        transition === t.id
                          ? "border-accent/40 bg-accent/10 text-ink"
                          : "border-ink/10 text-ink-muted hover:border-ink/20",
                      )}
                    >
                      <span className="block text-sm font-medium">
                        {t.label}
                      </span>
                      <span className="block text-[11px] opacity-80">
                        {t.hint}
                      </span>
                    </button>
                  ))}
                </div>
                {transition !== "none" ? (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-ink-muted">
                      Duration
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {TRANSITION_DURATION_OPTIONS.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            setTransitionDurationId(d.id);
                            clearPreset();
                          }}
                          className={cn(
                            "rounded-lg border px-3 py-1.5 text-xs transition",
                            transitionDurationId === d.id
                              ? "border-accent/40 bg-accent/10 text-ink"
                              : "border-ink/10 text-ink-muted hover:border-ink/20",
                          )}
                        >
                          <span className="font-medium">{d.label}</span>
                          <span className="ml-1 opacity-70">{d.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>

              {/* 6. Filter / look */}
              <section>
                <h3 className="text-sm font-medium text-ink">Filter / look</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  Color grade baked into the export.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {COLOR_FILTERS_UI.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setColorFilter(f.id);
                        // Let the new look use its baked-in grain/vignette.
                        setFilterGrain(null);
                        setFilterVignette(null);
                        clearPreset();
                      }}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left transition",
                        colorFilter === f.id
                          ? "border-accent/40 bg-accent/10 text-ink"
                          : "border-ink/10 text-ink-muted hover:border-ink/20",
                      )}
                    >
                      <span className="block text-sm font-medium">
                        {f.label}
                      </span>
                      <span className="block text-[11px] opacity-80">
                        {f.hint}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mt-3">
                  <p className="text-xs font-medium text-ink-muted">
                    Intensity
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {FILTER_INTENSITY_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setColorFilterIntensity(opt.id);
                          clearPreset();
                        }}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-xs transition",
                          colorFilterIntensity === opt.id
                            ? "border-accent/40 bg-accent/10 text-ink"
                            : "border-ink/10 text-ink-muted hover:border-ink/20",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFilterGrain((prev) =>
                        prev === null ? true : prev === true ? false : null,
                      );
                      clearPreset();
                    }}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs transition",
                      filterGrain === null
                        ? "border-ink/15 text-ink-muted"
                        : filterGrain
                          ? "border-accent/35 bg-accent/10 text-ink"
                          : "border-ink/25 bg-ink/5 text-ink-muted",
                    )}
                  >
                    {filterGrain === null
                      ? "Grain auto"
                      : filterGrain
                        ? "Grain on"
                        : "Grain off"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterVignette((prev) =>
                        prev === null ? true : prev === true ? false : null,
                      );
                      clearPreset();
                    }}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs transition",
                      filterVignette === null
                        ? "border-ink/15 text-ink-muted"
                        : filterVignette
                          ? "border-accent/35 bg-accent/10 text-ink"
                          : "border-ink/25 bg-ink/5 text-ink-muted",
                    )}
                  >
                    {filterVignette === null
                      ? "Vignette auto"
                      : filterVignette
                        ? "Vignette on"
                        : "Vignette off"}
                  </button>
                </div>
              </section>

              {/* 7. Zoom style / intensity */}
              <section>
                <h3 className="text-sm font-medium text-ink">
                  Zoom style / intensity
                </h3>
                <p className="mt-1 text-sm text-ink-muted">
                  Ken Burns intensity and direction per still.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ZOOM_OPTIONS.map((z) => (
                    <button
                      key={z.id}
                      type="button"
                      onClick={() => {
                        setZoomIntensity(z.id);
                        clearPreset();
                      }}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm transition",
                        zoomIntensity === z.id
                          ? "border-accent/40 bg-accent/10 text-ink"
                          : "border-ink/10 text-ink-muted hover:border-ink/20",
                      )}
                    >
                      {z.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ZOOM_DIRECTIONS.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        setZoomDirection(d.id);
                        clearPreset();
                      }}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-xs transition",
                        zoomDirection === d.id
                          ? "border-accent/40 bg-accent/10 text-ink"
                          : "border-ink/10 text-ink-muted hover:border-ink/20",
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </section>

              {/* 8. Music source */}
              <section>
                <h3 className="text-sm font-medium text-ink">Music source</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  None, library, or upload — mixed into the export.
                </p>
                <div className="mt-3">
                  <MovieMusicPicker
                    value={music}
                    onChange={(next) => {
                      setMusic(next);
                      clearPreset();
                    }}
                    suggestedTrackIds={suggestedMusicIds}
                    embedded
                    themeId={themeId}
                    targetDurationSeconds={pacing.targetDurationSeconds}
                    aiSoundtrackAllowed={capabilities.aiSoundtrack && capabilities.aiSoundtracks.allowed}
                    aiSoundtrackHint={
                      capabilities.aiSoundtrack
                        ? capabilities.aiSoundtracks.upgradeHint ??
                          capabilities.aiSoundtracks.reason
                        : "Upgrade to Family to generate AI soundtracks."
                    }
                    aiSoundtrackQuotaLabel={
                      capabilities.aiSoundtrack &&
                      capabilities.aiSoundtracks.limit != null
                        ? `${capabilities.aiSoundtracks.used ?? 0} of ${capabilities.aiSoundtracks.limit} AI soundtracks used this month`
                        : null
                    }
                  />
                </div>
              </section>
              {/* 9. Export quality (compact) */}
              <section>
                <h3 className="text-sm font-medium text-ink">Export quality</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  {outputPreview.width}×{outputPreview.height}
                </p>
                <div className="mt-3 flex gap-2">
                  {QUALITY_OPTIONS.map((opt) => {
                    const selected = qualityMode === opt.id;
                    const locked = Boolean(opt.premium && !canUltra);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          if (locked) {
                            setUpgradeMessage(
                              "Ultra 4K exports require Family Plus or higher.",
                            );
                            return;
                          }
                          setUpgradeMessage(null);
                          setQualityMode(opt.id);
                          clearPreset();
                        }}
                        className={cn(
                          "flex-1 rounded-lg border px-2 py-2 text-center transition",
                          selected
                            ? "border-accent/40 bg-accent/10 text-ink"
                            : "border-ink/10 text-ink-muted hover:border-ink/20",
                          locked && "opacity-80",
                        )}
                      >
                        <span className="block text-sm font-medium">
                          {opt.label}
                        </span>
                        <span className="block text-[11px] opacity-80">
                          {locked ? "Plus" : opt.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <p className="text-xs text-ink-muted">
                Uses {mediaCount} photo{mediaCount === 1 ? "" : "s"} from
                this memory.{" "}
                {estimateMovieRenderTime({
                  photoCount: mediaCount,
                  qualityMode,
                  hasMusic: music.musicSource !== "none",
                }).label}
                .
              </p>

              {/* 10. Create CTA */}
              <button
                type="button"
                disabled={submitting || mediaCount === 0 || !canCreate}
                onClick={() => void handleCreate()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-medium text-accent-foreground transition hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="size-4" aria-hidden />
                )}
                {submitting ? t("common.starting") : t("movie.createMovieCta")}
              </button>
            </div>
          ) : null}

          {phase === "crafting" ? (
            <CraftingState
              accent={panelAccent}
              movie={movie}
              photoCount={mediaCount}
              qualityMode={qualityMode}
              hasMusic={music.musicSource !== "none"}
            />
          ) : null}

          {phase === "ready" && movie ? (
            <ReadyState movie={movie} onCreateAnother={handleReset} />
          ) : null}

          {phase === "failed" ? (
            <FailedState
              message={
                error ||
                movie?.errorMessage ||
                copy.movie.failedTitle
              }
              onRetry={handleReset}
            />
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CraftingState({
  accent,
  movie,
  photoCount,
  qualityMode,
  hasMusic,
}: {
  accent: string;
  movie: SerializedMovie | null;
  photoCount: number;
  qualityMode: QualityMode;
  hasMusic: boolean;
}) {
  const copy = useCopy();
  const statusLabel =
    movie?.status === "processing"
      ? copy.movie.rendering
      : movie?.status === "queued"
        ? copy.movie.waiting
        : copy.movie.preparing;

  const estimate = estimateMovieRenderTime({
    photoCount,
    qualityMode,
    hasMusic,
  });

  return (
    <div className="flex flex-col items-center py-10 text-center">
      <div
        className="movie-pulse relative flex size-20 items-center justify-center rounded-full"
        style={{ backgroundColor: `${accent}18` }}
      >
        <Film className="size-8 text-ink" style={{ color: accent }} />
      </div>
      <p className="mt-6 font-display text-xl text-ink">
        {copy.movie.craftingBody}
      </p>
      <p className="mt-2 max-w-xs text-sm text-ink-muted">{statusLabel}</p>
      <div className="mt-8 h-1 w-48 overflow-hidden rounded-full bg-ink/8">
        <div className="movie-progress-bar h-full rounded-full bg-accent" />
      </div>
      <p className="mt-4 max-w-sm text-xs text-ink-muted">
        {estimate.label} for {photoCount} photo
        {photoCount === 1 ? "" : "s"}
        {qualityMode === "ultra"
          ? " at 4K"
          : qualityMode === "fast"
            ? " (fast mode)"
            : " at 1080p"}
        . Feel free to leave this open — we&apos;ll finish in the background.
      </p>
    </div>
  );
}

function ReadyState({
  movie,
  onCreateAnother,
}: {
  movie: SerializedMovie;
  onCreateAnother: () => void;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playback, setPlayback] = useState(movie);
  const aspect = movieAspectFromSettings(playback.settings);
  const aspectClass = movieAspectClass(aspect);

  // Mint a fresh signed URL when the ready screen mounts (poll URL may be stale).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/movies/${movie.id}`);
        const data = (await response.json().catch(() => ({}))) as {
          movie?: SerializedMovie;
        };
        if (!cancelled && data.movie?.playUrl) {
          setPlayback(data.movie);
        }
      } catch {
        /* keep poll URL */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [movie.id]);

  async function handleDownload() {
    try {
      const response = await fetch(`/api/movies/${movie.id}`);
      const data = (await response.json().catch(() => ({}))) as {
        movie?: SerializedMovie;
      };
      const fresh = data.movie;
      if (fresh?.downloadUrl) {
        setPlayback(fresh);
        downloadMovieFile(fresh);
        return;
      }
    } catch {
      /* fall through */
    }
    downloadMovieFile(playback);
  }

  return (
    <div className="space-y-5">
      <div
        className={cn(
          "mx-auto w-full overflow-hidden rounded-xl border border-ink/10 bg-ink/[0.03]",
          aspect === "9:16"
            ? "max-w-[280px]"
            : aspect === "1:1"
              ? "max-w-sm"
              : null,
        )}
      >
        {playback.playUrl ? (
          <video
            key={playback.playUrl}
            src={playback.playUrl}
            poster={playback.thumbnailUrl ?? undefined}
            controls
            playsInline
            className={cn(aspectClass, "w-full bg-ink/90")}
          />
        ) : (
          <div
            className={cn(
              aspectClass,
              "flex items-center justify-center text-sm text-ink-muted",
            )}
          >
            Preview unavailable — try download.
          </div>
        )}
      </div>

      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Check className="size-4" aria-hidden />
        </div>
        <div>
          <p className="font-display text-lg text-ink">{playback.title}</p>
          <p className="mt-0.5 text-sm text-ink-muted">
            {playback.durationSeconds
              ? `${Math.round(playback.durationSeconds)}s · `
              : null}
            {aspect} · {playback.styleLabel || playback.style}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {playback.playUrl ? (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition hover:bg-accent-deep sm:flex-none"
          >
            <Play className="size-3.5" aria-hidden />
            Play
          </button>
        ) : null}
        {playback.downloadUrl ? (
          <button
            type="button"
            onClick={() => void handleDownload()}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-ink/12 bg-canvas px-4 py-2.5 text-sm font-medium text-ink transition hover:border-accent/35 sm:flex-none"
          >
            <Download className="size-3.5" aria-hidden />
            Download MP4
          </button>
        ) : null}
        {playback.downloadUrl || playback.playUrl ? (
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-ink/12 px-4 py-2.5 text-sm font-medium text-ink transition hover:border-accent/35 sm:flex-none"
            aria-haspopup="dialog"
            aria-expanded={shareOpen}
          >
            <Share2 className="size-3.5" aria-hidden />
            Share
          </button>
        ) : null}
        <button
          type="button"
          onClick={onCreateAnother}
          className="inline-flex flex-1 items-center justify-center rounded-lg border border-ink/12 px-4 py-2.5 text-sm font-medium text-ink-muted transition hover:text-ink sm:flex-none"
        >
          Create another
        </button>
      </div>

      {shareOpen ? (
        <MovieShareDialog
          movie={playback}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
      {playing ? (
        <MoviePlayer movie={playback} onClose={() => setPlaying(false)} />
      ) : null}
    </div>
  );
}

function FailedState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const copy = useCopy();
  return (
    <div className="py-6 text-center">
      <p className="font-display text-xl text-ink">{copy.movie.failedTitle}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-ink-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground hover:bg-accent-deep"
      >
        {copy.movie.failedRetry}
      </button>
    </div>
  );
}
