"use client";

import { useMemo, useState } from "react";
import { Play } from "lucide-react";
import { LegacyVideoPlaybackModal } from "@/components/legacy/LegacyVideoPlaybackModal";
import { LegacyVideoPoster } from "@/components/legacy/LegacyVideoPoster";
import type { SerializedLegacyVideo } from "@/lib/legacy/serialize";
import {
  LEGACY_VIDEO_SECTION_LABELS,
  LEGACY_VIDEO_SECTION_TYPES,
  type LegacyVideoSectionType,
} from "@/lib/legacy/types";
import type { LegacyVideoPlaybackSource } from "@/lib/legacy/video-playback-client";

function formatDuration(totalSeconds: number | null | undefined): string | null {
  if (totalSeconds == null || totalSeconds < 0) return null;
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

type GrantedLegacyVideosProps = {
  ownerUserId: string;
  videos: SerializedLegacyVideo[];
};

/**
 * Read-only emergency-access video list.
 * Thumbnails lazy-sign on visibility; full playback URLs only when Play opens.
 */
export function GrantedLegacyVideos({
  ownerUserId,
  videos,
}: GrantedLegacyVideosProps) {
  const [playbackSource, setPlaybackSource] =
    useState<LegacyVideoPlaybackSource | null>(null);
  const [playbackTitle, setPlaybackTitle] = useState<string | undefined>();

  const grouped = useMemo(() => {
    const bySection = new Map<LegacyVideoSectionType, SerializedLegacyVideo[]>();
    for (const section of LEGACY_VIDEO_SECTION_TYPES) {
      bySection.set(section, []);
    }
    for (const video of videos) {
      const list = bySection.get(video.sectionType) ?? [];
      list.push(video);
      bySection.set(video.sectionType, list);
    }
    for (const list of bySection.values()) {
      list.sort((a, b) => {
        if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.createdAt.localeCompare(b.createdAt);
      });
    }
    return LEGACY_VIDEO_SECTION_TYPES.map((section) => ({
      section,
      videos: bySection.get(section) ?? [],
    })).filter((group) => group.videos.length > 0);
  }, [videos]);

  if (videos.length === 0) return null;

  function playVideo(video: SerializedLegacyVideo) {
    setPlaybackTitle(video.title);
    setPlaybackSource({
      mode: "granted_emergency",
      ownerUserId,
      videoId: video.id,
    });
  }

  return (
    <section className="legacy-vault-panel documents-vault-panel rounded-2xl p-5 sm:p-6">
      <h2 className="font-display text-xl text-[color:var(--legacy-ink)]">
        Video messages
      </h2>
      <p className="mt-2 text-sm text-[color:var(--legacy-muted)]">
        Private clips left for loved ones. Playback uses a short-lived secure
        link — nothing is preloaded until you press Play.
      </p>

      <div className="mt-4 space-y-6">
        {grouped.map(({ section, videos: sectionVideos }) => (
          <div key={section}>
            <h3 className="text-xs font-medium uppercase tracking-wide text-[color:var(--legacy-muted)]">
              {LEGACY_VIDEO_SECTION_LABELS[section]}
            </h3>
            <ul className="mt-3 space-y-3">
              {sectionVideos.map((video, index) => {
                const duration = formatDuration(video.durationSeconds);
                const source: LegacyVideoPlaybackSource = {
                  mode: "granted_emergency",
                  ownerUserId,
                  videoId: video.id,
                };
                const isOpsSection =
                  section === "business_operations" ||
                  section === "survivors_guidance";
                const watchFirst =
                  video.isPrimary || (isOpsSection && index === 0);
                return (
                  <li
                    key={video.id}
                    className="rounded-xl border border-[color:var(--legacy-line)] bg-white/50 px-4 py-3"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      {isOpsSection ? (
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
                        className="group relative w-full shrink-0 overflow-hidden rounded-lg sm:w-40"
                        aria-label={`Play ${video.title}`}
                      >
                        <LegacyVideoPoster
                          source={source}
                          hasThumbnail={video.hasThumbnail}
                          title={video.title}
                        />
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/25">
                          <span className="inline-flex size-9 items-center justify-center rounded-full bg-black/55 text-white shadow-sm">
                            <Play
                              className="size-4 translate-x-px"
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
                          {watchFirst ? (
                            <span className="rounded-full border border-[color:var(--legacy-accent)]/30 bg-[color:var(--legacy-accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--legacy-accent-deep)]">
                              {isOpsSection ? "Watch this first" : "Featured"}
                            </span>
                          ) : null}
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
                        ) : null}
                        <button
                          type="button"
                          onClick={() => playVideo(video)}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[color:var(--legacy-line)] bg-white/70 px-2.5 py-1.5 text-xs font-medium text-[color:var(--legacy-ink)] hover:bg-[color:var(--legacy-accent-soft)]"
                        >
                          <Play className="size-3.5" aria-hidden />
                          Play
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <LegacyVideoPlaybackModal
        open={Boolean(playbackSource)}
        source={playbackSource}
        fallbackTitle={playbackTitle}
        onClose={() => setPlaybackSource(null)}
      />
    </section>
  );
}
