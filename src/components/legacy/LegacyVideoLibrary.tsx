"use client";

import { useState, useTransition } from "react";
import { Play, Trash2 } from "lucide-react";
import { LegacyVideoPlaybackModal } from "@/components/legacy/LegacyVideoPlaybackModal";
import type { SerializedLegacyVideo } from "@/lib/legacy/serialize";
import type { LegacyVideoPlaybackSource } from "@/lib/legacy/video-playback-client";

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

type LegacyVideoLibraryProps = {
  videos: SerializedLegacyVideo[];
  onRemoved: (videoId: string) => void;
  onError?: (message: string) => void;
};

/**
 * Shared list of saved legacy videos for a section (recorded + uploaded).
 * Playback opens a modal that signs a short-lived URL on demand.
 */
export function LegacyVideoLibrary({
  videos,
  onRemoved,
  onError,
}: LegacyVideoLibraryProps) {
  const [pending, startTransition] = useTransition();
  const [playbackSource, setPlaybackSource] =
    useState<LegacyVideoPlaybackSource | null>(null);
  const [playbackTitle, setPlaybackTitle] = useState<string | undefined>();

  if (videos.length === 0) return null;

  function play(video: SerializedLegacyVideo) {
    setPlaybackTitle(video.title);
    setPlaybackSource({ mode: "owner", videoId: video.id });
  }

  function remove(video: SerializedLegacyVideo) {
    const ok = window.confirm(
      `Remove “${video.title}”? This can’t be undone.`,
    );
    if (!ok) return;

    startTransition(async () => {
      try {
        const res = await fetch(`/api/legacy/videos/${video.id}`, {
          method: "DELETE",
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || "Could not remove that video.");
        }
        if (
          playbackSource?.mode === "owner" &&
          playbackSource.videoId === video.id
        ) {
          setPlaybackSource(null);
        }
        onRemoved(video.id);
      } catch (err) {
        onError?.(
          err instanceof Error ? err.message : "Could not remove that video.",
        );
      }
    });
  }

  return (
    <div className="legacy-vault-panel documents-vault-panel legacy-vault-in rounded-2xl p-5 sm:p-6">
      <h3 className="font-display text-lg tracking-tight text-[color:var(--legacy-ink)]">
        Saved videos
      </h3>
      <p className="mt-1 text-sm text-[color:var(--legacy-muted)]">
        Recorded and uploaded clips in this section.
      </p>
      <ul className="mt-4 space-y-2">
        {videos.map((video) => (
          <li
            key={video.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--legacy-line)] bg-white/50 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[color:var(--legacy-ink)]">
                {video.title}
              </p>
              <p className="text-xs text-[color:var(--legacy-muted)]">
                {video.sourceType === "recorded" ? "Recorded" : "Uploaded"}
                {video.durationSeconds
                  ? ` · ${formatDuration(video.durationSeconds)}`
                  : ""}
                {video.description?.trim()
                  ? ` · ${video.description.trim().slice(0, 80)}${video.description.trim().length > 80 ? "…" : ""}`
                  : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                disabled={pending}
                onClick={() => play(video)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)] disabled:opacity-50"
                aria-label={`Play ${video.title}`}
              >
                <Play className="size-3.5" aria-hidden />
                Play
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(video)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
                aria-label={`Remove ${video.title}`}
              >
                <Trash2 className="size-3.5" aria-hidden />
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <LegacyVideoPlaybackModal
        open={Boolean(playbackSource)}
        source={playbackSource}
        fallbackTitle={playbackTitle}
        onClose={() => setPlaybackSource(null)}
      />
    </div>
  );
}
