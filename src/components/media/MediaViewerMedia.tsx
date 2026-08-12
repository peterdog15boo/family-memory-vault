"use client";

import { useCallback, useState } from "react";
import { ImageIcon, Loader2 } from "lucide-react";
import { useMediaViewerSrc } from "@/components/media/useMediaViewerSrc";
import { cn } from "@/lib/utils";

type MediaViewerMediaProps = {
  mediaId: string;
  type: "photo" | "video" | string;
  /**
   * @deprecated Ignored — viewers never render grid thumbnails.
   * Kept optional for existing call sites.
   */
  previewUrl?: string | null;
  alt: string;
  className?: string;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  onVideoEnded?: () => void;
  videoControls?: boolean;
  /** Use on dark stages (slideshow) so the skeleton stays visible. */
  onDark?: boolean;
};

/**
 * Lightbox / slideshow media — full-resolution (display/original) only.
 * Never mounts thumbnail assets. Shows a spinner until the signed URL is ready,
 * then shows the image immediately (no opacity race).
 */
export function MediaViewerMedia({
  mediaId,
  type,
  alt,
  className,
  videoRef,
  onVideoEnded,
  videoControls = true,
  onDark = false,
}: MediaViewerMediaProps) {
  const isVideo = type === "video";
  const { src, ready, error } = useMediaViewerSrc({
    mediaId,
    type,
    purpose: isVideo ? "original" : "display",
  });

  if (error && !src) {
    return (
      <div
        className={cn(
          "flex min-h-64 min-w-80 flex-col items-center justify-center gap-3 p-10 text-ink-muted",
          className,
        )}
      >
        <ImageIcon className="size-10 opacity-40" aria-hidden />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (isVideo) {
    return (
      <div
        className={cn(
          "relative flex min-h-64 min-w-[16rem] items-center justify-center",
          className,
        )}
      >
        {!ready ? (
          <ViewerLoadingPlaceholder label="Loading video…" onDark={onDark} />
        ) : (
          <video
            key={src!}
            ref={videoRef}
            src={src!}
            controls={videoControls}
            playsInline
            autoPlay={!videoControls}
            onEnded={onVideoEnded}
            aria-label={alt || "Family video"}
            className="max-h-[85vh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex min-h-64 min-w-[16rem] items-center justify-center",
        className,
      )}
    >
      {!ready ? (
        <ViewerLoadingPlaceholder label="Loading photo…" onDark={onDark} />
      ) : (
        <PhotoFrame key={src!} src={src!} alt={alt} onDark={onDark} />
      )}
    </div>
  );
}

/**
 * Renders the photo at full opacity once the browser has pixels.
 * Uses a ref callback so cached images (complete=true before onLoad) still reveal.
 */
function PhotoFrame({
  src,
  alt,
  onDark,
}: {
  src: string;
  alt: string;
  onDark?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  const ref = useCallback((node: HTMLImageElement | null) => {
    if (!node) return;
    if (node.complete && node.naturalWidth > 0) {
      setVisible(true);
    }
  }, []);

  return (
    <>
      {!visible ? (
        <ViewerLoadingPlaceholder label="Loading photo…" onDark={onDark} />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt={alt}
        decoding="async"
        fetchPriority="high"
        onLoad={() => setVisible(true)}
        onError={() => setVisible(true)}
        className={cn(
          "max-h-[85vh] w-auto max-w-full rounded-lg object-contain shadow-2xl",
          visible ? "relative opacity-100" : "absolute opacity-0 pointer-events-none",
        )}
      />
    </>
  );
}

function ViewerLoadingPlaceholder({
  label,
  onDark,
}: {
  label: string;
  onDark?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-h-64 w-full max-w-xl flex-col items-center justify-center gap-3 rounded-xl px-10 py-16",
        onDark ? "bg-white/10" : "bg-ink/8",
      )}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <Loader2
        className={cn(
          "size-8 animate-spin",
          onDark ? "text-white/90" : "text-ink-muted",
        )}
        aria-hidden
      />
      <p
        className={cn(
          "text-sm font-medium",
          onDark ? "text-white/90" : "text-ink-muted",
        )}
      >
        {label}
      </p>
    </div>
  );
}
