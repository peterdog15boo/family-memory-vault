"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Video } from "lucide-react";
import {
  fetchLegacyVideoThumbnail,
  type LegacyVideoPlaybackSource,
} from "@/lib/legacy/video-playback-client";

type LegacyVideoPosterProps = {
  source: LegacyVideoPlaybackSource;
  hasThumbnail: boolean;
  title: string;
  className?: string;
  /** Only fetch when the tile is near the viewport. */
  lazy?: boolean;
};

/**
 * Lazy poster image for list cards.
 * Never signs or loads the full video object.
 */
export function LegacyVideoPoster({
  source,
  hasThumbnail,
  title,
  className,
  lazy = true,
}: LegacyVideoPosterProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(!lazy);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!lazy || !ref.current) return;
    const node = ref.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [lazy]);

  useEffect(() => {
    if (!visible || !hasThumbnail || url || failed) return;
    let cancelled = false;
    setLoading(true);
    void fetchLegacyVideoThumbnail(source)
      .then((thumb) => {
        if (cancelled) return;
        if (thumb) setUrl(thumb);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Intentionally key off stable identity fields, not the source object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    visible,
    hasThumbnail,
    url,
    failed,
    source.mode,
    source.videoId,
    source.mode === "granted_emergency" ? source.ownerUserId : null,
  ]);

  return (
    <div
      ref={ref}
      className={
        className ??
        "relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-[color:var(--legacy-ink)]/8"
      }
      aria-hidden
    >
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex flex-col items-center gap-1.5 text-[color:var(--legacy-muted)]">
          {loading ? (
            <Loader2 className="size-5 animate-spin opacity-60" />
          ) : (
            <Video className="size-6 opacity-45" />
          )}
          <span className="sr-only">{title}</span>
        </div>
      )}
    </div>
  );
}
