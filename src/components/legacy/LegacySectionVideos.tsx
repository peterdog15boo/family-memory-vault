"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Pencil,
  Play,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { LegacyVideoPlaybackModal } from "@/components/legacy/LegacyVideoPlaybackModal";
import { LegacyVideoPoster } from "@/components/legacy/LegacyVideoPoster";
import { LegacyVideoRecorder } from "@/components/legacy/LegacyVideoRecorder";
import { LegacyVideoUploader } from "@/components/legacy/LegacyVideoUploader";
import type { SerializedLegacyVideo } from "@/lib/legacy/serialize";
import type { LegacyVideoStarter } from "@/lib/legacy/nav";
import type { LegacyVideoSectionType } from "@/lib/legacy/types";
import type { LegacyVideoPlaybackSource } from "@/lib/legacy/video-playback-client";

type AddMode = null | "record" | "upload";

type LegacySectionVideosProps = {
  sectionType: LegacyVideoSectionType;
  initialVideos?: SerializedLegacyVideo[];
  /** Show in-browser recorder (message page). Default true. */
  allowRecord?: boolean;
  /** Softer heading for nested instruction sections. */
  compact?: boolean;
  /**
   * "operations" — Business Continuity walkthroughs: numbered order,
   * starter titles, written summaries, “Watch this first”.
   */
  intent?: "default" | "operations";
  /** Suggested titles when intent is operations (or any custom starters). */
  suggestedTitles?: LegacyVideoStarter[];
};

function formatDuration(totalSeconds: number | null | undefined): string | null {
  if (totalSeconds == null || totalSeconds < 0) return null;
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function sortVideos(
  rows: SerializedLegacyVideo[],
  intent: "default" | "operations",
): SerializedLegacyVideo[] {
  return [...rows].sort((a, b) => {
    if (intent === "operations") {
      // Recommended watching order is primary for operations guides.
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    }
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function LegacySectionVideos({
  sectionType,
  initialVideos = [],
  allowRecord = true,
  compact = false,
  intent = "default",
  suggestedTitles = [],
}: LegacySectionVideosProps) {
  const isOperations = intent === "operations";
  const [videos, setVideos] = useState(() =>
    sortVideos(
      initialVideos.filter((row) => row.sectionType === sectionType),
      intent,
    ),
  );
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [pendingStarter, setPendingStarter] = useState<LegacyVideoStarter | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [playbackSource, setPlaybackSource] =
    useState<LegacyVideoPlaybackSource | null>(null);
  const [playbackTitle, setPlaybackTitle] = useState<string | undefined>();

  useEffect(() => {
    setVideos(
      sortVideos(
        initialVideos.filter((row) => row.sectionType === sectionType),
        intent,
      ),
    );
  }, [initialVideos, sectionType, intent]);

  const orderedIds = useMemo(() => videos.map((v) => v.id), [videos]);

  const unusedStarters = useMemo(() => {
    const used = new Set(videos.map((v) => v.title.trim().toLowerCase()));
    return suggestedTitles.filter(
      (starter) => !used.has(starter.title.trim().toLowerCase()),
    );
  }, [suggestedTitles, videos]);

  const handleSaved = useCallback(
    (video: SerializedLegacyVideo) => {
      setError(null);
      setVideos((prev) => {
        if (prev.some((row) => row.id === video.id)) return prev;
        return sortVideos([...prev, video], intent);
      });
      setAddMode(null);
      setPendingStarter(null);
    },
    [intent],
  );

  function playVideo(video: SerializedLegacyVideo) {
    setError(null);
    setPlaybackTitle(video.title);
    setPlaybackSource({ mode: "owner", videoId: video.id });
  }

  function startEdit(video: SerializedLegacyVideo) {
    setEditingId(video.id);
    setEditTitle(video.title);
    setEditDescription(video.description ?? "");
    setError(null);
  }

  function beginAdd(mode: Exclude<AddMode, null>, starter?: LegacyVideoStarter) {
    setPendingStarter(starter ?? null);
    setAddMode(mode);
    setError(null);
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editingId) return;
    if (!editTitle.trim()) {
      setError("Please add a title.");
      return;
    }
    setBusyId(editingId);
    setError(null);
    try {
      const res = await fetch(`/api/legacy/videos/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        video?: SerializedLegacyVideo;
      };
      if (!res.ok || !data.video) {
        throw new Error(data.error || "Could not save changes.");
      }
      setVideos((prev) =>
        sortVideos(
          prev.map((row) => (row.id === editingId ? data.video! : row)),
          intent,
        ),
      );
      setEditingId(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save changes.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function moveVideo(videoId: string, direction: "up" | "down") {
    const index = orderedIds.indexOf(videoId);
    if (index < 0) return;
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= orderedIds.length) return;

    const previous = videos;
    const next = [...orderedIds];
    const tmp = next[index]!;
    next[index] = next[swapWith]!;
    next[swapWith] = tmp;

    setVideos(() => {
      const byId = new Map(previous.map((row) => [row.id, row]));
      return next
        .map((id, sortOrder) => {
          const row = byId.get(id);
          return row ? { ...row, sortOrder } : null;
        })
        .filter((row): row is SerializedLegacyVideo => Boolean(row));
    });

    setBusyId(videoId);
    setError(null);
    try {
      const res = await fetch("/api/legacy/videos/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionType, orderedIds: next }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        videos?: SerializedLegacyVideo[];
      };
      if (!res.ok || !data.videos) {
        throw new Error(data.error || "Could not reorder videos.");
      }
      setVideos(sortVideos(data.videos, intent));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not reorder videos.",
      );
      setVideos(previous);
    } finally {
      setBusyId(null);
    }
  }

  async function markWatchFirst(video: SerializedLegacyVideo) {
    setBusyId(video.id);
    setError(null);
    try {
      // Move to front of recommended order, then feature as primary.
      const without = orderedIds.filter((id) => id !== video.id);
      const nextOrder = [video.id, ...without];

      const reorderRes = await fetch("/api/legacy/videos/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionType, orderedIds: nextOrder }),
      });
      const reorderData = (await reorderRes.json().catch(() => ({}))) as {
        error?: string;
        videos?: SerializedLegacyVideo[];
      };
      if (!reorderRes.ok || !reorderData.videos) {
        throw new Error(reorderData.error || "Could not update order.");
      }

      const featureRes = await fetch(`/api/legacy/videos/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: true }),
      });
      const featureData = (await featureRes.json().catch(() => ({}))) as {
        error?: string;
        video?: SerializedLegacyVideo;
      };
      if (!featureRes.ok || !featureData.video) {
        throw new Error(featureData.error || "Could not mark as Watch this first.");
      }

      setVideos(
        sortVideos(
          reorderData.videos.map((row) =>
            row.id === video.id
              ? featureData.video!
              : { ...row, isPrimary: false },
          ),
          intent,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not mark as Watch this first.",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function removeVideo(video: SerializedLegacyVideo) {
    const ok = window.confirm(
      `Remove “${video.title}”? This can’t be undone.`,
    );
    if (!ok) return;
    setBusyId(video.id);
    setError(null);
    try {
      const res = await fetch(`/api/legacy/videos/${video.id}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Could not remove that video.");
      }
      setVideos((prev) => prev.filter((row) => row.id !== video.id));
      if (
        playbackSource?.mode === "owner" &&
        playbackSource.videoId === video.id
      ) {
        setPlaybackSource(null);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not remove that video.",
      );
    } finally {
      setBusyId(null);
    }
  }

  const defaultRecordTitle =
    pendingStarter?.title ||
    (isOperations ? "Start Here" : "A message for you");

  return (
    <div
      className={
        compact
          ? "mt-6 border-t border-[color:var(--legacy-line)] pt-5"
          : "legacy-vault-panel documents-vault-panel legacy-vault-in space-y-5 rounded-2xl p-5 sm:p-6"
      }
    >
      <div>
        <h3
          className={
            compact
              ? isOperations
                ? "font-display text-lg tracking-tight text-[color:var(--legacy-ink)]"
                : "text-sm font-medium text-[color:var(--legacy-ink)]"
              : "font-display text-xl tracking-tight text-[color:var(--legacy-ink)]"
          }
        >
          {isOperations
            ? "Operational walkthrough videos"
            : compact
              ? "Spoken or video notes"
              : "Videos for your loved ones"}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--legacy-muted)]">
          {isOperations
            ? "Record short clips in the order someone should watch them — for example Start Here, Systems Access, then People to Call. Add an optional written summary under each video so the key points are easy to scan."
            : compact
              ? "Optional. A short video can sit beside the written guidance above — recorded here or uploaded from your device."
              : "You can leave a short spoken message, or upload a video you’ve already made. These stay private in your vault."}
        </p>
      </div>

      {isOperations && unusedStarters.length > 0 && addMode === null ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--legacy-muted)]">
            Suggested topics
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {unusedStarters.map((starter) => (
              <button
                key={starter.title}
                type="button"
                onClick={() => beginAdd("record", starter)}
                className="rounded-full border border-[color:var(--legacy-line)] bg-white/60 px-3 py-1.5 text-xs font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
                title={starter.summaryHint}
              >
                {starter.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {videos.length > 0 ? (
        <ol className="space-y-3">
          {videos.map((video, index) => {
            const duration = formatDuration(video.durationSeconds);
            const isEditing = editingId === video.id;
            const busy = busyId === video.id;
            const watchFirst =
              isOperations && (video.isPrimary || index === 0);

            return (
              <li
                key={video.id}
                className="rounded-xl border border-[color:var(--legacy-line)] bg-white/55 px-4 py-3.5"
              >
                {isEditing ? (
                  <form onSubmit={(e) => void saveEdit(e)} className="space-y-3">
                    <label className="block">
                      <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--legacy-muted)]">
                        Title
                      </span>
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        maxLength={200}
                        required
                        disabled={busy}
                        placeholder={
                          isOperations
                            ? "e.g. Start Here, Systems Access…"
                            : undefined
                        }
                        className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
                      />
                      {isOperations && suggestedTitles.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {suggestedTitles.map((starter) => (
                            <button
                              key={starter.title}
                              type="button"
                              onClick={() => {
                                setEditTitle(starter.title);
                                if (
                                  !editDescription.trim() &&
                                  starter.summaryHint
                                ) {
                                  setEditDescription("");
                                }
                              }}
                              className="rounded-full border border-[color:var(--legacy-line)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--legacy-muted)] hover:bg-[color:var(--legacy-accent-soft)]"
                            >
                              {starter.title}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--legacy-muted)]">
                        {isOperations ? "Written summary" : "Description"}{" "}
                        <span className="normal-case tracking-normal">
                          (optional)
                        </span>
                      </span>
                      <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        maxLength={4000}
                        rows={isOperations ? 4 : 3}
                        disabled={busy}
                        placeholder={
                          isOperations
                            ? "A few lines someone can skim — passwords stay in Secure Items."
                            : undefined
                        }
                        className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/80 px-3 py-2 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={busy}
                        className="rounded-md bg-[color:var(--legacy-accent)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[color:var(--legacy-accent-deep)] disabled:opacity-50"
                      >
                        {busy ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditingId(null)}
                        className="rounded-md border border-[color:var(--legacy-line)] px-3.5 py-2 text-sm font-medium text-[color:var(--legacy-muted)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    {isOperations ? (
                      <div
                        className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--legacy-line)] bg-[color:var(--legacy-accent-soft)]/60 text-xs font-semibold text-[color:var(--legacy-accent-deep)] sm:mt-1"
                        aria-label={`Step ${index + 1}`}
                      >
                        {index + 1}
                      </div>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => playVideo(video)}
                      disabled={busy}
                      className="group relative w-full shrink-0 overflow-hidden rounded-lg sm:w-40"
                      aria-label={`Play ${video.title}`}
                    >
                      <LegacyVideoPoster
                        source={{ mode: "owner", videoId: video.id }}
                        hasThumbnail={video.hasThumbnail}
                        title={video.title}
                        className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-[color:var(--legacy-ink)]/8"
                      />
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/25">
                        <span className="inline-flex size-9 items-center justify-center rounded-full bg-black/55 text-white shadow-sm">
                          <Play className="size-4 translate-x-px" aria-hidden />
                        </span>
                      </span>
                    </button>

                    <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-[color:var(--legacy-ink)]">
                            {video.title}
                          </p>
                          {watchFirst ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--legacy-accent)]/30 bg-[color:var(--legacy-accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--legacy-accent-deep)]">
                              <Star className="size-3" aria-hidden />
                              Watch this first
                            </span>
                          ) : (
                            <span className="rounded-full border border-[color:var(--legacy-line)] bg-[color:var(--legacy-accent-soft)]/50 px-2 py-0.5 text-[11px] font-medium text-[color:var(--legacy-accent-deep)]">
                              {video.sourceType === "recorded"
                                ? "Recorded here"
                                : "Uploaded"}
                            </span>
                          )}
                          {duration ? (
                            <span className="text-xs text-[color:var(--legacy-muted)]">
                              {duration}
                            </span>
                          ) : null}
                        </div>
                        {video.description?.trim() ? (
                          <p className="mt-1.5 text-sm leading-relaxed text-[color:var(--legacy-muted)]">
                            {video.description.trim()}
                          </p>
                        ) : isOperations ? (
                          <button
                            type="button"
                            onClick={() => startEdit(video)}
                            className="mt-1.5 text-left text-sm text-[color:var(--legacy-muted)] underline-offset-2 hover:underline"
                          >
                            Add a short written summary…
                          </button>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => playVideo(video)}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--legacy-line)] bg-white/70 px-2.5 py-1.5 text-xs font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)] disabled:opacity-50"
                        >
                          <Play className="size-3.5" aria-hidden />
                          Play
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(video)}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--legacy-line)] bg-white/70 px-2.5 py-1.5 text-xs font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)] disabled:opacity-50"
                          aria-label={`Edit ${video.title}`}
                        >
                          <Pencil className="size-3.5" aria-hidden />
                          Edit
                        </button>
                        {isOperations && !watchFirst ? (
                          <button
                            type="button"
                            onClick={() => void markWatchFirst(video)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--legacy-line)] bg-white/70 px-2.5 py-1.5 text-xs font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)] disabled:opacity-50"
                          >
                            <Star className="size-3.5" aria-hidden />
                            Watch first
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void moveVideo(video.id, "up")}
                          disabled={busy || index === 0}
                          className="rounded-md border border-[color:var(--legacy-line)] bg-white/70 px-2 py-1.5 text-[color:var(--legacy-muted)] hover:bg-white disabled:opacity-40"
                          aria-label="Move earlier in recommended order"
                          title="Move earlier in recommended order"
                        >
                          <ChevronUp className="size-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => void moveVideo(video.id, "down")}
                          disabled={busy || index === videos.length - 1}
                          className="rounded-md border border-[color:var(--legacy-line)] bg-white/70 px-2 py-1.5 text-[color:var(--legacy-muted)] hover:bg-white disabled:opacity-40"
                          aria-label="Move later in recommended order"
                          title="Move later in recommended order"
                        >
                          <ChevronDown className="size-3.5" aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeVideo(video)}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 rounded-md border border-red-800/15 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
                          aria-label={`Remove ${video.title}`}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-sm text-[color:var(--legacy-muted)]">
          {isOperations
            ? "No walkthrough videos yet. Start with a short “Start Here” orientation, then add systems, contacts, or customer guidance as needed."
            : "No videos here yet. When you’re ready, you can add one below."}
        </p>
      )}

      {addMode === null ? (
        <div className="flex flex-wrap gap-2">
          {allowRecord ? (
            <button
              type="button"
              onClick={() => beginAdd("record")}
              className="inline-flex items-center gap-2 rounded-md border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
            >
              <Camera className="size-4" aria-hidden />
              {isOperations ? "Record a walkthrough" : "Record a message"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => beginAdd("upload")}
            className="inline-flex items-center gap-2 rounded-md border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
          >
            <Upload className="size-4" aria-hidden />
            {isOperations ? "Upload a walkthrough" : "Upload a video"}
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-[color:var(--legacy-line)] bg-white/40 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-[color:var(--legacy-ink)]">
                {addMode === "record"
                  ? isOperations
                    ? pendingStarter
                      ? `Record: ${pendingStarter.title}`
                      : "Record an operational walkthrough"
                    : "Record a personal message"
                  : isOperations
                    ? pendingStarter
                      ? `Upload: ${pendingStarter.title}`
                      : "Upload an operational walkthrough"
                    : "Upload a video"}
              </p>
              {isOperations && pendingStarter?.summaryHint ? (
                <p className="mt-1 text-xs leading-relaxed text-[color:var(--legacy-muted)]">
                  After saving, you can add a written summary — for example:{" "}
                  {pendingStarter.summaryHint}
                </p>
              ) : isOperations ? (
                <p className="mt-1 text-xs leading-relaxed text-[color:var(--legacy-muted)]">
                  Use a clear title like “Start Here” or “Systems Access”. Keep
                  it practical — someone may be watching under stress.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setAddMode(null);
                setPendingStarter(null);
              }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[color:var(--legacy-muted)] hover:bg-white/80"
            >
              <X className="size-3.5" aria-hidden />
              Close
            </button>
          </div>
          {addMode === "record" ? (
            <LegacyVideoRecorder
              sectionType={sectionType}
              showLibrary={false}
              embedded
              defaultTitle={defaultRecordTitle}
              onSaved={handleSaved}
            />
          ) : (
            <LegacyVideoUploader
              sectionType={sectionType}
              embedded
              defaultTitle={defaultRecordTitle}
              onUploaded={handleSaved}
            />
          )}
        </div>
      )}

      {error ? (
        <p className="text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      <LegacyVideoPlaybackModal
        open={Boolean(playbackSource)}
        source={playbackSource}
        fallbackTitle={playbackTitle}
        onClose={() => setPlaybackSource(null)}
      />
    </div>
  );
}
