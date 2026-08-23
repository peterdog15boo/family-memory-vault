"use client";

import { useState } from "react";
import { Film, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SerializedSafeMedia } from "@/lib/memories/types";

type MediaThumbProps = {
  item: Pick<
    SerializedSafeMedia,
    "type" | "previewUrl" | "originalFilename" | "hasThumbnail"
  >;
  className?: string;
  alt?: string;
};

function ThumbImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-ink/5",
          className,
        )}
      >
        <ImageIcon className="size-6 text-ink/25" aria-hidden />
        <span className="sr-only">{alt}</span>
      </div>
    );
  }

  return (
    <div className={cn("relative h-full w-full bg-ink/5", className)}>
      {!loaded ? (
        <div className="ui-skeleton absolute inset-0" aria-hidden />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        sizes="(max-width: 640px) 50vw, 160px"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={cn(
          "media-thumb-img h-full w-full object-cover transition-opacity duration-300",
          loaded ? "is-loaded opacity-100" : "is-loading opacity-0",
        )}
      />
    </div>
  );
}

/** Shared photo/video thumbnail for memory UIs — prefers signed thumbnail JPEG. */
export function MediaThumb({ item, className, alt }: MediaThumbProps) {
  const label = alt || item.originalFilename || "Family photo";

  // When hasThumbnail is true, previewUrl is a small JPEG even for videos.
  // Grids must keep using this thumbnail URL — never the display/original.
  if (item.previewUrl && (item.type === "photo" || item.hasThumbnail)) {
    return (
      <div className={cn("relative h-full w-full", className)}>
        <ThumbImage src={item.previewUrl} alt={label} />
        {item.type === "video" ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink/15">
            <Film className="size-5 text-accent-foreground drop-shadow" aria-hidden />
          </span>
        ) : null}
      </div>
    );
  }

  if (item.previewUrl && item.type === "video") {
    // Fallback while video poster is still generating: metadata frame.
    return (
      <div className={cn("relative h-full w-full bg-ink/5", className)}>
        <video
          src={item.previewUrl}
          muted
          playsInline
          preload="metadata"
          onLoadedData={(event) => {
            const video = event.currentTarget;
            try {
              if (video.duration && Number.isFinite(video.duration)) {
                // Avoid black / fade-in intro frames (match server poster seek).
                video.currentTime = Math.min(
                  Math.max(2, video.duration * 0.5),
                  Math.max(0.25, video.duration - 0.1),
                );
              }
            } catch {
              // ignore
            }
          }}
          className="media-thumb-img is-loaded h-full w-full object-cover"
          aria-label={label}
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink/20">
          <Film className="size-5 text-accent-foreground drop-shadow" aria-hidden />
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-1 bg-ink/5 text-ink/30",
        className,
      )}
    >
      {item.type === "video" ? (
        <Film className="size-6" aria-hidden />
      ) : (
        <ImageIcon className="size-6" aria-hidden />
      )}
      <span className="px-2 text-center text-[10px] text-ink/40">
        {item.hasThumbnail ? "Loading preview…" : "Almost ready…"}
      </span>
    </div>
  );
}
