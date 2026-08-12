"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Music2, Pause, Play, Sparkles, Upload, X } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import {
  LIBRARY_MUSIC_LICENSE,
  MUSIC_CATEGORIES,
  MUSIC_CATEGORY_LABELS,
  MOVIE_LIBRARY_TRACKS,
  libraryTrackPreviewUrl,
  type MusicCategory,
} from "@/lib/movies/music/library";
import type { MusicSource } from "@/lib/movies/settings";
import { cn } from "@/lib/utils";

export type MovieMusicSelection = {
  musicSource: MusicSource;
  musicTrackId: string | null;
  musicUploadKey: string | null;
  musicLabel: string | null;
  musicSuggestionId: string | null;
  musicVolume: number;
  musicFadeInMs: number;
  musicFadeOutMs: number;
  musicLoop: boolean;
  musicAiGenerated: boolean;
  musicAiProvider: string | null;
};

type LibraryApiTrack = {
  id: string;
  label: string;
  category: MusicCategory;
  categoryLabel: string;
  durationSeconds: number;
  blurb: string;
  moodTags: string[];
  previewUrl: string;
  attribution?: string | null;
};

type MovieMusicPickerProps = {
  value: MovieMusicSelection;
  onChange: (next: MovieMusicSelection) => void;
  /** Prefer these library track ids when opening the library (theme hints). */
  suggestedTrackIds?: string[];
  /** Hide outer heading when embedded under another section title. */
  embedded?: boolean;
  /** Movie theme / style for AI prompt defaults. */
  themeId?: string | null;
  /** Target movie length — used when generating an AI bed. */
  targetDurationSeconds?: number;
  /** Plan allows AI generation (Family+). */
  aiSoundtrackAllowed?: boolean;
  /** Optional upgrade / quota copy when locked. */
  aiSoundtrackHint?: string | null;
  /** e.g. "2 of 5 this month" */
  aiSoundtrackQuotaLabel?: string | null;
};

const SOURCE_OPTION_IDS: (MusicSource | "ai")[] = [
  "none",
  "library",
  "upload",
  "ai",
];

type PickerTab = MusicSource | "ai";

const FADE_PRESET_VALUES: { id: string; inMs: number; outMs: number }[] = [
  { id: "short", inMs: 800, outMs: 1200 },
  { id: "medium", inMs: 1500, outMs: 2500 },
  { id: "long", inMs: 2500, outMs: 4000 },
];

const AI_PROMPT_HINTS = [
  "warm family piano",
  "cinematic memorial",
  "soft holiday strings",
  "bright acoustic joy",
];

function tracksFromCatalog(): LibraryApiTrack[] {
  return MOVIE_LIBRARY_TRACKS.map((t) => ({
    id: t.id,
    label: t.label,
    category: t.category,
    categoryLabel: MUSIC_CATEGORY_LABELS[t.category],
    durationSeconds: t.durationSeconds,
    blurb: t.blurb,
    moodTags: [...t.moodTags],
    attribution: t.attribution ?? null,
    previewUrl: libraryTrackPreviewUrl(t),
  }));
}

export function MovieMusicPicker({
  value,
  onChange,
  suggestedTrackIds = [],
  embedded = false,
  themeId = null,
  targetDurationSeconds = 45,
  aiSoundtrackAllowed = false,
  aiSoundtrackHint = null,
  aiSoundtrackQuotaLabel = null,
}: MovieMusicPickerProps) {
  const t = useTranslations();
  const [category, setCategory] = useState<MusicCategory | "all">("all");
  const [tracks, setTracks] = useState<LibraryApiTrack[]>(tracksFromCatalog);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [tab, setTab] = useState<PickerTab>(
    value.musicAiGenerated && value.musicSource === "upload"
      ? "ai"
      : value.musicSource,
  );
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiJobId, setAiJobId] = useState<string | null>(null);
  const [aiProgress, setAiProgress] = useState(0);
  const [aiStatusMessage, setAiStatusMessage] = useState<string | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const sourceOptions = useMemo(
    () =>
      SOURCE_OPTION_IDS.map((id) => ({
        id,
        label:
          id === "none"
            ? t("movie.musicNone")
            : id === "library"
              ? t("movie.musicLibrary")
              : id === "upload"
                ? t("movie.musicUpload")
                : t("movie.musicAiGenerate"),
      })),
    [t],
  );

  const fadePresets = useMemo(
    () =>
      FADE_PRESET_VALUES.map((f) => ({
        ...f,
        label:
          f.id === "short"
            ? t("movie.fadeShort")
            : f.id === "medium"
              ? t("movie.fadeMedium")
              : t("movie.fadeLong"),
      })),
    [t],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/movies/music/library");
        if (!res.ok) return;
        const data = (await res.json()) as { tracks?: LibraryApiTrack[] };
        if (!cancelled && data.tracks?.length) setTracks(data.tracks);
      } catch {
        // Fall back to static catalog already in state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const filteredTracks = useMemo(() => {
    const list =
      category === "all"
        ? tracks
        : tracks.filter((t) => t.category === category);
    if (suggestedTrackIds.length === 0) return list;
    return [...list].sort((a, b) => {
      const as = suggestedTrackIds.includes(a.id) ? 0 : 1;
      const bs = suggestedTrackIds.includes(b.id) ? 0 : 1;
      return as - bs;
    });
  }, [tracks, category, suggestedTrackIds]);

  const selectedTrack = useMemo(
    () =>
      value.musicTrackId
        ? tracks.find((t) => t.id === value.musicTrackId) ?? null
        : null,
    [tracks, value.musicTrackId],
  );

  const selectedLabel =
    value.musicLabel || selectedTrack?.label || null;

  const activeFadeId =
    fadePresets.find(
      (f) =>
        f.inMs === value.musicFadeInMs && f.outMs === value.musicFadeOutMs,
    )?.id ?? "custom";

  const stopPreview = useCallback(() => {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    setPreviewTrackId(null);
    setPreviewLoadingId(null);
  }, []);

  const patch = useCallback(
    (partial: Partial<MovieMusicSelection>) => {
      onChange({ ...value, ...partial });
    },
    [onChange, value],
  );

  async function playPreviewUrl(url: string, trackKey: string) {
    setPreviewLoadingId(trackKey);
    setUploadError(null);
    try {
      audioRef.current?.pause();
      const audio = new Audio(url);
      audio.volume = Math.min(1, Math.max(0, value.musicVolume));
      audioRef.current = audio;
      audio.onended = () => setPreviewTrackId(null);
      await audio.play();
      setPreviewTrackId(trackKey);
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : t("movie.errorPreview"),
      );
      setPreviewTrackId(null);
    } finally {
      setPreviewLoadingId(null);
    }
  }

  async function toggleTrackPreview(track: LibraryApiTrack) {
    if (previewTrackId === track.id) {
      stopPreview();
      return;
    }
    // Selecting + previewing remembers the track on movie settings.
    patch({
      musicSource: "library",
      musicTrackId: track.id,
      musicUploadKey: null,
      musicLabel: track.label,
      musicSuggestionId: track.id,
      musicAiGenerated: false,
      musicAiProvider: null,
    });
    await playPreviewUrl(track.previewUrl, track.id);
  }

  async function toggleSelectedPreview() {
    if (previewTrackId === "selected") {
      stopPreview();
      return;
    }
    setPreviewLoadingId("selected");
    setUploadError(null);
    try {
      let url: string | null = null;
      if (value.musicSource === "library" && value.musicTrackId) {
        url =
          tracks.find((t) => t.id === value.musicTrackId)?.previewUrl ?? null;
      } else if (value.musicSource === "upload" && value.musicUploadKey) {
        const res = await fetch("/api/movies/music/preview-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: value.musicUploadKey }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          url?: string;
          error?: string;
        };
        if (!res.ok || !data.url) {
          throw new Error(data.error || t("movie.errorLoadPreview"));
        }
        url = data.url;
      }
      if (!url) return;
      await playPreviewUrl(url, "selected");
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : t("movie.errorPreview"),
      );
    } finally {
      setPreviewLoadingId(null);
    }
  }

  function selectNone() {
    stopPreview();
    setTab("none");
    setAiJobId(null);
    setAiGenerating(false);
    setAiProgress(0);
    setAiStatusMessage(null);
    patch({
      musicSource: "none",
      musicTrackId: null,
      musicUploadKey: null,
      musicLabel: null,
      musicSuggestionId: null,
      musicAiGenerated: false,
      musicAiProvider: null,
    });
  }

  function selectLibraryTrack(track: LibraryApiTrack) {
    stopPreview();
    setTab("library");
    patch({
      musicSource: "library",
      musicTrackId: track.id,
      musicUploadKey: null,
      musicLabel: track.label,
      musicSuggestionId: track.id,
      musicAiGenerated: false,
      musicAiProvider: null,
    });
  }

  async function startAiGenerate() {
    if (!aiSoundtrackAllowed || aiGenerating) return;
    setUploadError(null);
    setAiGenerating(true);
    setAiProgress(8);
    setAiStatusMessage(t("common.starting"));
    stopPreview();
    try {
      const res = await fetch("/api/movies/music/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          themeId: themeId || undefined,
          userPrompt: aiPrompt.trim() || undefined,
          durationSeconds: targetDurationSeconds,
          forceInstrumental: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        jobId?: string;
        progressPercent?: number;
        statusMessage?: string | null;
        error?: string;
      };
      if (!res.ok || !data.jobId) {
        throw new Error(data.error || t("movie.errorStartGeneration"));
      }
      setAiJobId(data.jobId);
      setAiProgress(data.progressPercent ?? 10);
      setAiStatusMessage(data.statusMessage ?? t("movie.queued"));
    } catch (err) {
      setAiGenerating(false);
      setAiJobId(null);
      setUploadError(
        err instanceof Error ? err.message : t("movie.errorGenerationFailed"),
      );
    }
  }

  useEffect(() => {
    if (!aiJobId || !aiGenerating) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const res = await fetch(`/api/movies/music/generate/${aiJobId}`);
        const data = (await res.json().catch(() => ({}))) as {
          stage?: string;
          progressPercent?: number;
          statusMessage?: string | null;
          error?: string | null;
          result?: {
            key: string;
            label: string;
            providerId?: string;
          } | null;
        };
        if (cancelled) return;
        if (!res.ok) {
          throw new Error(data.error || t("movie.errorCheckGeneration"));
        }
        setAiProgress(data.progressPercent ?? 0);
        setAiStatusMessage(data.statusMessage ?? null);

        if (data.stage === "ready" && data.result?.key) {
          setAiGenerating(false);
          setAiJobId(null);
          setTab("ai");
          patch({
            musicSource: "upload",
            musicTrackId: null,
            musicUploadKey: data.result.key,
            musicLabel: data.result.label || t("movie.aiGeneratedSoundtrack"),
            musicSuggestionId: null,
            musicAiGenerated: true,
            musicAiProvider: data.result.providerId ?? "elevenlabs",
          });
          return;
        }
        if (data.stage === "failed") {
          setAiGenerating(false);
          setAiJobId(null);
          setUploadError(data.error || t("movie.errorSoundtrackFailed"));
          return;
        }
        timer = setTimeout(() => void poll(), 2000);
      } catch (err) {
        if (cancelled) return;
        setAiGenerating(false);
        setAiJobId(null);
        setUploadError(
          err instanceof Error ? err.message : t("movie.errorGenerationFailed"),
        );
      }
    }

    timer = setTimeout(() => void poll(), 1500);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [aiJobId, aiGenerating, patch, t]);

  async function handleUpload(file: File | null) {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    stopPreview();
    try {
      const contentType =
        file.type ||
        (file.name.toLowerCase().endsWith(".wav")
          ? "audio/wav"
          : file.name.toLowerCase().endsWith(".m4a")
            ? "audio/mp4"
            : "audio/mpeg");

      const presign = await fetch("/api/movies/music/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType,
          size: file.size,
        }),
      });
      const presignData = (await presign.json().catch(() => ({}))) as {
        url?: string;
        key?: string;
        error?: string;
      };
      if (!presign.ok || !presignData.url || !presignData.key) {
        throw new Error(presignData.error || t("movie.errorStartUpload"));
      }

      const put = await fetch(presignData.url, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
      });
      if (!put.ok) {
        throw new Error(t("movie.errorUploadAudio"));
      }

      const complete = await fetch("/api/movies/music/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: presignData.key,
          filename: file.name,
          contentType,
        }),
      });
      const completeData = (await complete.json().catch(() => ({}))) as {
        key?: string;
        label?: string;
        error?: string;
      };
      if (!complete.ok || !completeData.key) {
        throw new Error(completeData.error || t("movie.errorSaveUpload"));
      }

      patch({
        musicSource: "upload",
        musicTrackId: null,
        musicUploadKey: completeData.key,
        musicLabel: completeData.label || file.name,
        musicSuggestionId: null,
        musicAiGenerated: false,
        musicAiProvider: null,
      });
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : t("movie.errorUploadFailed"),
      );
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const showAiPanel =
    tab === "ai" || (value.musicAiGenerated && value.musicSource === "upload");

  return (
    <section>
      {!embedded ? (
        <>
          <h3 className="text-sm font-medium text-ink">{t("movie.music")}</h3>
          <p className="mt-1 text-sm text-ink-muted">{t("movie.musicLead")}</p>
        </>
      ) : null}

      <div className={cn("flex flex-wrap gap-2", embedded ? null : "mt-3")}>
        {sourceOptions.map((opt) => {
          const selected =
            opt.id === "ai"
              ? tab === "ai" || value.musicAiGenerated
              : tab === opt.id && !value.musicAiGenerated;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                if (opt.id === "none") selectNone();
                else if (opt.id === "library") {
                  stopPreview();
                  setTab("library");
                  const first =
                    tracks.find((t) => suggestedTrackIds.includes(t.id)) ||
                    tracks[0];
                  patch({
                    musicSource: "library",
                    musicUploadKey: null,
                    musicTrackId: value.musicTrackId || first?.id || "soft-piano",
                    musicLabel:
                      value.musicLabel || first?.label || "Soft Piano",
                    musicSuggestionId:
                      value.musicSuggestionId ||
                      value.musicTrackId ||
                      first?.id ||
                      "soft-piano",
                    musicAiGenerated: false,
                    musicAiProvider: null,
                  });
                } else if (opt.id === "upload") {
                  stopPreview();
                  setTab("upload");
                  patch({
                    musicSource: "upload",
                    musicTrackId: null,
                    musicSuggestionId: null,
                    musicAiGenerated: false,
                    musicAiProvider: null,
                  });
                } else {
                  stopPreview();
                  setTab("ai");
                }
              }}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm transition",
                selected
                  ? "border-accent/40 bg-accent/10 text-ink"
                  : "border-ink/10 text-ink-muted hover:border-ink/20",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {tab === "library" && !value.musicAiGenerated ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setCategory("all")}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] transition",
                category === "all"
                  ? "border-accent/40 bg-accent/10 text-ink"
                  : "border-ink/10 text-ink-muted",
              )}
            >
              {t("movie.musicAll")}
            </button>
            {MUSIC_CATEGORIES.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setCategory(id)}
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] transition",
                  category === id
                    ? "border-accent/40 bg-accent/10 text-ink"
                    : "border-ink/10 text-ink-muted",
                )}
              >
                {MUSIC_CATEGORY_LABELS[id]}
              </button>
            ))}
          </div>

          <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
            {filteredTracks.map((track) => {
              const selected = value.musicTrackId === track.id;
              const isPreviewing = previewTrackId === track.id;
              const isLoading = previewLoadingId === track.id;
              return (
                <div
                  key={track.id}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 transition",
                    selected
                      ? "border-accent/40 bg-accent/10"
                      : "border-ink/10 hover:border-ink/18",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => selectLibraryTrack(track)}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  >
                    <Music2
                      className="mt-0.5 size-3.5 shrink-0 text-ink-muted"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink">
                        {track.label}
                      </span>
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {track.moodTags?.map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-ink/[0.06] px-1.5 py-0.5 text-[10px] text-ink-muted"
                          >
                            {tag}
                          </span>
                        ))}
                      </span>
                      <span className="mt-1 block text-[11px] text-ink-muted">
                        {track.categoryLabel} · {track.blurb}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(previewLoadingId)}
                    onClick={() => void toggleTrackPreview(track)}
                    className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md border border-ink/12 px-2 py-1 text-[11px] font-medium text-ink transition hover:border-accent/35 disabled:opacity-50"
                    aria-label={
                      isPreviewing
                        ? t("movie.stopPreviewTrack", { label: track.label })
                        : t("movie.previewTrack", { label: track.label })
                    }
                  >
                    {isLoading ? (
                      <Loader2 className="size-3 animate-spin" aria-hidden />
                    ) : isPreviewing ? (
                      <Pause className="size-3" aria-hidden />
                    ) : (
                      <Play className="size-3" aria-hidden />
                    )}
                    {isPreviewing ? t("movie.stop") : t("movie.preview")}
                  </button>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] leading-snug text-ink-muted/80">
            {LIBRARY_MUSIC_LICENSE}
          </p>
        </div>
      ) : null}

      {tab === "upload" && !value.musicAiGenerated ? (
        <div className="mt-3 space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,.mp3,.wav,.m4a,.aac"
            className="hidden"
            onChange={(e) => void handleUpload(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-ink/20 bg-canvas px-3 py-3 text-sm text-ink transition hover:border-accent/40 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="size-4" aria-hidden />
            )}
            {uploading ? t("common.uploading") : t("movie.uploadAudio")}
          </button>
          <p className="text-[11px] text-ink-muted">
            {t("movie.uploadAudioHint")}
          </p>
        </div>
      ) : null}

      {showAiPanel ? (
        <div className="mt-3 space-y-3 rounded-lg border border-ink/10 bg-ink/[0.02] px-3 py-3">
          <div className="flex items-start gap-2">
            <Sparkles
              className="mt-0.5 size-4 shrink-0 text-accent"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">
                {t("movie.generateSoundtrack")}
              </p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                AI-generated soundtrack · instrumental bed from a legitimate
                music API · length matches your movie (~
                {Math.round(targetDurationSeconds)}s, capped for cost)
              </p>
            </div>
          </div>

          {!aiSoundtrackAllowed ? (
            <p className="text-xs text-ink-muted">
              {aiSoundtrackHint || t("movie.aiAvailableFamily")}
            </p>
          ) : (
            <>
              <label className="block">
                <span className="text-xs text-ink-muted">
                  {t("movie.optionalDirection")}
                </span>
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  disabled={aiGenerating}
                  maxLength={240}
                  placeholder="warm family piano, cinematic memorial…"
                  className="mt-1 w-full rounded-md border border-ink/12 bg-canvas px-2.5 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-accent/40 focus:outline-none"
                />
              </label>
              <div className="flex flex-wrap gap-1.5">
                {AI_PROMPT_HINTS.map((hint) => (
                  <button
                    key={hint}
                    type="button"
                    disabled={aiGenerating}
                    onClick={() => setAiPrompt(hint)}
                    className="rounded-md border border-ink/10 px-2 py-1 text-[11px] text-ink-muted transition hover:border-accent/35 disabled:opacity-50"
                  >
                    {hint}
                  </button>
                ))}
              </div>
              {aiSoundtrackQuotaLabel ? (
                <p className="text-[11px] text-ink-muted">
                  {aiSoundtrackQuotaLabel}
                </p>
              ) : null}
              <button
                type="button"
                disabled={aiGenerating}
                onClick={() => void startAiGenerate()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-accent/35 bg-accent/10 px-3 py-2.5 text-sm font-medium text-ink transition hover:bg-accent/15 disabled:opacity-50"
              >
                {aiGenerating ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="size-4" aria-hidden />
                )}
                {aiGenerating
                  ? t("movie.generatingSoundtrack")
                  : value.musicAiGenerated
                    ? t("movie.generateNewSoundtrack")
                    : t("movie.generateSoundtrackCta")}
              </button>
              {aiGenerating ? (
                <div className="space-y-1.5" aria-live="polite">
                  <div className="flex items-center justify-between text-[11px] text-ink-muted">
                    <span>{aiStatusMessage || t("common.working")}</span>
                    <span className="tabular-nums">{aiProgress}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-500"
                      style={{ width: `${Math.min(100, aiProgress)}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      {uploadError ? (
        <p className="mt-2 text-xs text-red-700">{uploadError}</p>
      ) : null}

      {value.musicSource !== "none" && selectedLabel ? (
        <div className="mt-3 rounded-lg border border-ink/10 bg-ink/[0.03] px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-ink-muted">
                {value.musicAiGenerated
                  ? t("movie.aiGeneratedSoundtrack")
                  : t("movie.selectedSoundtrack")}
              </p>
              <p className="truncate text-sm font-medium text-ink">
                {selectedLabel}
              </p>
              {value.musicAiGenerated ? (
                <p className="mt-1 text-[11px] text-ink-muted">
                  Clearly labeled AI audio · mixed as background music on export
                  {value.musicAiProvider
                    ? ` · ${value.musicAiProvider}`
                    : ""}
                </p>
              ) : selectedTrack?.moodTags?.length ? (
                <p className="mt-1 flex flex-wrap gap-1">
                  {selectedTrack.moodTags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-ink/[0.06] px-1.5 py-0.5 text-[10px] text-ink-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </p>
              ) : null}
              {!value.musicAiGenerated ? (
                <p className="mt-1 text-[11px] text-ink-muted">
                  Remembered on this movie · loops to full length on export
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                disabled={Boolean(previewLoadingId)}
                onClick={() => void toggleSelectedPreview()}
                className="inline-flex items-center gap-1 rounded-md border border-ink/12 px-2 py-1 text-xs font-medium text-ink transition hover:border-accent/35 disabled:opacity-50"
              >
                {previewLoadingId === "selected" ? (
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                ) : previewTrackId === "selected" ||
                  (previewTrackId &&
                    previewTrackId === value.musicTrackId) ? (
                  <Pause className="size-3" aria-hidden />
                ) : (
                  <Play className="size-3" aria-hidden />
                )}
                {t("movie.preview")}
              </button>
              <button
                type="button"
                onClick={selectNone}
                className="rounded-md border border-ink/10 p-1.5 text-ink-muted transition hover:text-ink"
                aria-label={t("movie.removeMusic")}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          </div>

          <label className="mt-3 block">
            <span className="flex items-center justify-between text-xs text-ink-muted">
              {t("movie.volume")}
              <span className="tabular-nums text-ink">
                {Math.round(value.musicVolume * 100)}%
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(value.musicVolume * 100)}
              onChange={(e) => {
                const next = Number(e.target.value) / 100;
                patch({ musicVolume: next });
                if (audioRef.current) audioRef.current.volume = next;
              }}
              className="mt-1.5 w-full accent-[var(--accent,#4a7c6f)]"
            />
          </label>

          <div className="mt-3">
            <p className="text-xs text-ink-muted">{t("movie.fadeInOut")}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {fadePresets.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() =>
                    patch({
                      musicFadeInMs: f.inMs,
                      musicFadeOutMs: f.outMs,
                    })
                  }
                  className={cn(
                    "rounded-md border px-2 py-1 text-[11px] transition",
                    activeFadeId === f.id
                      ? "border-accent/40 bg-accent/10 text-ink"
                      : "border-ink/10 text-ink-muted",
                  )}
                >
                  {f.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => patch({ musicLoop: !value.musicLoop })}
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] transition",
                  value.musicLoop
                    ? "border-accent/40 bg-accent/10 text-ink"
                    : "border-ink/10 text-ink-muted",
                )}
              >
                {value.musicLoop ? t("movie.loopOn") : t("movie.loopOff")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
