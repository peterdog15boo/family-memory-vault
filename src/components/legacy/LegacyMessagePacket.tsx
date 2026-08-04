"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Camera,
  Heart,
  Pencil,
  Play,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { LegacyMessageForm } from "@/components/legacy/LegacyMessageForm";
import { LegacyVideoPlaybackModal } from "@/components/legacy/LegacyVideoPlaybackModal";
import { LegacyVideoPoster } from "@/components/legacy/LegacyVideoPoster";
import { LegacyVideoRecorder } from "@/components/legacy/LegacyVideoRecorder";
import { LegacyVideoUploader } from "@/components/legacy/LegacyVideoUploader";
import type {
  SerializedLegacyProfile,
  SerializedLegacyVideo,
} from "@/lib/legacy/serialize";
import type { LegacyVideoPlaybackSource } from "@/lib/legacy/video-playback-client";

type AddMode = null | "record" | "upload";

type LegacyMessagePacketProps = {
  profile: SerializedLegacyProfile;
  initialVideos?: SerializedLegacyVideo[];
};

function formatDuration(totalSeconds: number | null | undefined): string | null {
  if (totalSeconds == null || totalSeconds < 0) return null;
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function sortMessageVideos(
  rows: SerializedLegacyVideo[],
): SerializedLegacyVideo[] {
  return [...rows]
    .filter((row) => row.sectionType === "message_to_loved_ones")
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.createdAt.localeCompare(b.createdAt);
    });
}

/**
 * Combined farewell packet: featured video message(s) + written letter.
 * Intentionally warm and human — not a generic media library.
 */
export function LegacyMessagePacket({
  profile,
  initialVideos = [],
}: LegacyMessagePacketProps) {
  const [videos, setVideos] = useState(() => sortMessageVideos(initialVideos));
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [playbackSource, setPlaybackSource] =
    useState<LegacyVideoPlaybackSource | null>(null);
  const [playbackTitle, setPlaybackTitle] = useState<string | undefined>();

  useEffect(() => {
    setVideos(sortMessageVideos(initialVideos));
  }, [initialVideos]);

  const primary = useMemo(
    () => videos.find((video) => video.isPrimary) ?? videos[0] ?? null,
    [videos],
  );
  const others = useMemo(
    () => videos.filter((video) => video.id !== primary?.id),
    [videos, primary],
  );

  const handleSaved = useCallback((video: SerializedLegacyVideo) => {
    setError(null);
    setVideos((prev) => {
      if (prev.some((row) => row.id === video.id)) return prev;
      return sortMessageVideos([...prev, video]);
    });
    setAddMode(null);
  }, []);

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

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editingId) return;
    if (!editTitle.trim()) {
      setError("Please add a short title for this message.");
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
        sortMessageVideos(
          prev.map((row) => (row.id === editingId ? data.video! : row)),
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

  async function featureVideo(video: SerializedLegacyVideo) {
    if (video.isPrimary) return;
    setBusyId(video.id);
    setError(null);
    try {
      const res = await fetch(`/api/legacy/videos/${video.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: true }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        video?: SerializedLegacyVideo;
      };
      if (!res.ok || !data.video) {
        throw new Error(data.error || "Could not feature this message.");
      }
      setVideos((prev) =>
        sortMessageVideos(
          prev.map((row) =>
            row.id === video.id
              ? data.video!
              : { ...row, isPrimary: false },
          ),
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not feature this message.",
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
        throw new Error(data.error || "Could not remove that message.");
      }
      setVideos((prev) => {
        const next = prev.filter((row) => row.id !== video.id);
        if (video.isPrimary && next.length > 0 && !next.some((r) => r.isPrimary)) {
          return sortMessageVideos([
            { ...next[0]!, isPrimary: true },
            ...next.slice(1),
          ]);
        }
        return sortMessageVideos(next);
      });
      if (
        playbackSource?.mode === "owner" &&
        playbackSource.videoId === video.id
      ) {
        setPlaybackSource(null);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not remove that message.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <header className="legacy-vault-panel documents-vault-panel legacy-vault-in rounded-2xl p-5 sm:p-6">
        <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-[color:var(--legacy-muted)]">
          <Heart className="size-3.5" aria-hidden />
          Farewell packet
        </p>
        <h2 className="mt-2 font-display text-2xl tracking-tight text-[color:var(--legacy-ink)] sm:text-3xl">
          Message to Loved Ones
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[color:var(--legacy-muted)]">
          Leave them your voice and your words together — a short video they can
          watch when they miss you, and a letter they can return to. Neither has
          to be perfect. Presence matters more than polish.
        </p>
      </header>

      <section className="legacy-vault-panel documents-vault-panel legacy-vault-in space-y-5 rounded-2xl p-5 sm:p-6">
        <div>
          <h3 className="font-display text-xl tracking-tight text-[color:var(--legacy-ink)]">
            Speak to them
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--legacy-muted)]">
            A minute or two is often enough. Imagine them sitting nearby. Say
            what you would want them to hear — love, thanks, reassurance, or a
            story only you can tell. You can add more than one message if you’d
            like (for different people, or different moments).
          </p>
        </div>

        {primary ? (
          <div className="overflow-hidden rounded-2xl border border-[color:var(--legacy-line)] bg-white/45">
            <button
              type="button"
              onClick={() => playVideo(primary)}
              disabled={busyId === primary.id}
              className="group relative block w-full text-left"
              aria-label={`Play featured message: ${primary.title}`}
            >
              <LegacyVideoPoster
                source={{ mode: "owner", videoId: primary.id }}
                hasThumbnail={primary.hasThumbnail}
                title={primary.title}
                className="relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden bg-[color:var(--legacy-ink)]/10 sm:aspect-[2/1]"
              />
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/45 via-black/10 to-transparent">
                <span className="inline-flex size-14 items-center justify-center rounded-full bg-white/90 text-[color:var(--legacy-accent-deep)] shadow-md transition group-hover:scale-105">
                  <Play className="size-6 translate-x-0.5" aria-hidden />
                </span>
              </span>
            </button>
            <div className="space-y-3 px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--legacy-accent)]/30 bg-[color:var(--legacy-accent-soft)] px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--legacy-accent-deep)]">
                  <Star className="size-3" aria-hidden />
                  Featured message
                </span>
                {formatDuration(primary.durationSeconds) ? (
                  <span className="text-xs text-[color:var(--legacy-muted)]">
                    {formatDuration(primary.durationSeconds)}
                  </span>
                ) : null}
              </div>
              {editingId === primary.id ? (
                <form onSubmit={(e) => void saveEdit(e)} className="space-y-3">
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    maxLength={200}
                    required
                    disabled={busyId === primary.id}
                    className="w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
                    aria-label="Message title"
                  />
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    maxLength={4000}
                    rows={2}
                    disabled={busyId === primary.id}
                    placeholder="Optional note — who this is for, or what you hoped to say"
                    className="w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/80 px-3 py-2 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      disabled={busyId === primary.id}
                      className="rounded-md bg-[color:var(--legacy-accent)] px-3.5 py-2 text-sm font-medium text-white hover:bg-[color:var(--legacy-accent-deep)] disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-md border border-[color:var(--legacy-line)] px-3.5 py-2 text-sm font-medium text-[color:var(--legacy-muted)]"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div>
                    <p className="font-medium text-[color:var(--legacy-ink)]">
                      {primary.title}
                    </p>
                    {primary.description?.trim() ? (
                      <p className="mt-1 text-sm leading-relaxed text-[color:var(--legacy-muted)]">
                        {primary.description.trim()}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => playVideo(primary)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--legacy-line)] bg-white/70 px-2.5 py-1.5 text-xs font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
                    >
                      <Play className="size-3.5" aria-hidden />
                      Watch
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(primary)}
                      disabled={busyId === primary.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--legacy-line)] bg-white/70 px-2.5 py-1.5 text-xs font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)] disabled:opacity-50"
                    >
                      <Pencil className="size-3.5" aria-hidden />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeVideo(primary)}
                      disabled={busyId === primary.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-red-800/15 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      Remove
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[color:var(--legacy-line)] bg-white/35 px-5 py-8 text-center">
            <p className="font-display text-lg text-[color:var(--legacy-ink)]">
              When you’re ready, leave them your voice
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[color:var(--legacy-muted)]">
              Short is welcome. A quiet “I love you,” a memory, or the words you
              never quite said out loud — any of it is a gift.
            </p>
          </div>
        )}

        {others.length > 0 ? (
          <div className="space-y-3">
            <h4 className="text-xs font-medium uppercase tracking-wide text-[color:var(--legacy-muted)]">
              More messages
            </h4>
            <ul className="space-y-3">
              {others.map((video) => {
                const duration = formatDuration(video.durationSeconds);
                const busy = busyId === video.id;
                const isEditing = editingId === video.id;
                return (
                  <li
                    key={video.id}
                    className="rounded-xl border border-[color:var(--legacy-line)] bg-white/50 px-4 py-3.5"
                  >
                    {isEditing ? (
                      <form
                        onSubmit={(e) => void saveEdit(e)}
                        className="space-y-3"
                      >
                        <input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          maxLength={200}
                          required
                          disabled={busy}
                          className="w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
                        />
                        <textarea
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          maxLength={4000}
                          rows={2}
                          disabled={busy}
                          className="w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/80 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="submit"
                            disabled={busy}
                            className="rounded-md bg-[color:var(--legacy-accent)] px-3.5 py-2 text-sm font-medium text-white disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-md border border-[color:var(--legacy-line)] px-3.5 py-2 text-sm font-medium text-[color:var(--legacy-muted)]"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                        <button
                          type="button"
                          onClick={() => playVideo(video)}
                          disabled={busy}
                          className="group relative w-full shrink-0 overflow-hidden rounded-lg sm:w-36"
                          aria-label={`Play ${video.title}`}
                        >
                          <LegacyVideoPoster
                            source={{ mode: "owner", videoId: video.id }}
                            hasThumbnail={video.hasThumbnail}
                            title={video.title}
                          />
                          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <span className="inline-flex size-8 items-center justify-center rounded-full bg-black/55 text-white">
                              <Play
                                className="size-3.5 translate-x-px"
                                aria-hidden
                              />
                            </span>
                          </span>
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-[color:var(--legacy-ink)]">
                              {video.title}
                            </p>
                            {duration ? (
                              <span className="text-xs text-[color:var(--legacy-muted)]">
                                {duration}
                              </span>
                            ) : null}
                          </div>
                          {video.description?.trim() ? (
                            <p className="mt-1 text-sm text-[color:var(--legacy-muted)]">
                              {video.description.trim()}
                            </p>
                          ) : null}
                          <div className="mt-2.5 flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => playVideo(video)}
                              className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--legacy-line)] bg-white/70 px-2.5 py-1.5 text-xs font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
                            >
                              <Play className="size-3.5" aria-hidden />
                              Watch
                            </button>
                            <button
                              type="button"
                              onClick={() => void featureVideo(video)}
                              disabled={busy}
                              className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--legacy-line)] bg-white/70 px-2.5 py-1.5 text-xs font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)] disabled:opacity-50"
                            >
                              <Star className="size-3.5" aria-hidden />
                              Feature this
                            </button>
                            <button
                              type="button"
                              onClick={() => startEdit(video)}
                              disabled={busy}
                              className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--legacy-line)] bg-white/70 px-2.5 py-1.5 text-xs font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)] disabled:opacity-50"
                            >
                              <Pencil className="size-3.5" aria-hidden />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeVideo(video)}
                              disabled={busy}
                              className="inline-flex items-center gap-1.5 rounded-md border border-red-800/15 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
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
            </ul>
          </div>
        ) : null}

        {addMode === null ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={() => {
                setAddMode("record");
                setError(null);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[color:var(--legacy-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[color:var(--legacy-accent-deep)]"
            >
              <Camera className="size-4" aria-hidden />
              {videos.length === 0
                ? "Record a short message"
                : "Record another message"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAddMode("upload");
                setError(null);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-[color:var(--legacy-line)] bg-white/70 px-3.5 py-2.5 text-sm font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
            >
              <Upload className="size-4" aria-hidden />
              Add a video you already made
            </button>
            <p className="text-xs leading-relaxed text-[color:var(--legacy-muted)] sm:max-w-xs">
              Aim for warmth over perfection. About one to two minutes is a
              lovely length.
            </p>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-[color:var(--legacy-line)] bg-white/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-[color:var(--legacy-ink)]">
                  {addMode === "record"
                    ? "Record from the heart"
                    : "Add a video you already made"}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[color:var(--legacy-muted)]">
                  {addMode === "record"
                    ? "Take a breath. Look toward the camera as if they’re here. You can re-record as many times as you need."
                    : "Choose a clip that already feels like you — a birthday toast, a quiet talk, or something filmed just for this."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddMode(null)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[color:var(--legacy-muted)] hover:bg-white/80"
              >
                <X className="size-3.5" aria-hidden />
                Close
              </button>
            </div>
            {addMode === "record" ? (
              <LegacyVideoRecorder
                sectionType="message_to_loved_ones"
                showLibrary={false}
                embedded
                defaultTitle="For you, with love"
                onSaved={handleSaved}
              />
            ) : (
              <LegacyVideoUploader
                sectionType="message_to_loved_ones"
                embedded
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
      </section>

      <LegacyMessageForm profile={profile} variant="letter" />

      <LegacyVideoPlaybackModal
        open={Boolean(playbackSource)}
        source={playbackSource}
        fallbackTitle={playbackTitle}
        onClose={() => setPlaybackSource(null)}
      />
    </div>
  );
}
