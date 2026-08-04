"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  getMediaOverlayClass,
  type MediaOverlayId,
  type MediaType,
} from "@/lib/media-section/overlays";
import type {
  MediaSectionAtmosphere,
  MediaSectionMediaFilter,
} from "@/lib/media-section/treatments";
import { usePrefersReducedMotion } from "@/components/media-section/usePrefersReducedMotion";

export type CinematicBackdropProps = {
  mediaType?: MediaType;
  /** Image or video URL (depending on mediaType) */
  src?: string | null;
  /** Poster / reduced-motion still for video */
  poster?: string | null;
  overlay?: MediaOverlayId;
  atmosphere?: MediaSectionAtmosphere;
  mediaFilter?: MediaSectionMediaFilter;
  sheen?: boolean;
  imageAlt?: string;
  /** Eager-load heroes / LCP — skips lazy media */
  priority?: boolean;
  className?: string;
};

/**
 * Full-bleed cinematic backdrop: image, muted looping video, or atmosphere + overlay.
 *
 * Atmosphere always paints first so the stage never shows an empty gray frame
 * while photography/video loads. Media then fades in over it.
 */
export function CinematicBackdrop({
  mediaType = "none",
  src = null,
  poster = null,
  overlay = "dark-soft",
  atmosphere = "warm",
  mediaFilter = "soft",
  sheen = false,
  imageAlt = "",
  priority = false,
  className,
}: CinematicBackdropProps) {
  const reducedMotion = usePrefersReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stillImgRef = useRef<HTMLImageElement>(null);
  const [nearViewport, setNearViewport] = useState(priority);
  const [mediaReady, setMediaReady] = useState(false);

  const stillSrc =
    poster || (mediaType === "image" ? src : null) || null;
  const wantsVideo =
    mediaType === "video" && Boolean(src) && !reducedMotion;
  const stillUrl = stillSrc || (mediaType === "image" ? src : null);

  useEffect(() => {
    setMediaReady(false);

    if (!priority || !stillUrl) return;
    const probe = new Image();
    probe.src = stillUrl;
    if (probe.complete && probe.naturalWidth > 0) {
      setMediaReady(true);
    }
  }, [src, poster, mediaType, priority, stillUrl]);

  useEffect(() => {
    if (priority) {
      setNearViewport(true);
      return;
    }

    const root = rootRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px 0px", threshold: 0.01 },
    );

    observer.observe(root);
    return () => observer.disconnect();
  }, [priority]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !wantsVideo || !nearViewport) return;

    const play = () => {
      void video.play().catch(() => {
        /* Autoplay may be blocked; poster remains */
      });
    };

    const visibility = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) play();
        else video.pause();
      },
      { threshold: 0.15 },
    );

    visibility.observe(video);
    if (video.readyState >= 2) play();
    else video.addEventListener("loadeddata", play, { once: true });

    return () => visibility.disconnect();
  }, [wantsVideo, nearViewport, src]);

  const showVideo = wantsVideo && nearViewport;
  const showStill =
    Boolean(stillUrl) &&
    (priority || nearViewport) &&
    (!showVideo || Boolean(poster || stillSrc));

  useEffect(() => {
    if (!showStill) return;
    const img = stillImgRef.current;
    if (img?.complete && img.naturalWidth > 0) setMediaReady(true);
  }, [stillUrl, showStill]);

  // Safety: never leave a hero stage invisible if load events stall
  useEffect(() => {
    if (!nearViewport || mediaReady) return;
    if (!showStill && !showVideo) {
      setMediaReady(true);
      return;
    }
    const timer = window.setTimeout(() => setMediaReady(true), 1800);
    return () => window.clearTimeout(timer);
  }, [nearViewport, mediaReady, showStill, showVideo]);

  const mediaClass = cn(
    "media-section-media cinematic-backdrop-media absolute inset-0 h-full w-full object-cover",
    `media-section-media--${mediaFilter}`,
  );

  const revealed = reducedMotion || (nearViewport && mediaReady);

  return (
    <div
      ref={rootRef}
      className={cn(
        "media-section-backdrop cinematic-backdrop pointer-events-none absolute inset-0 overflow-hidden",
        nearViewport && "cinematic-backdrop--active",
        revealed && "cinematic-backdrop--revealed",
        priority && "cinematic-backdrop--priority",
        className,
      )}
      aria-hidden
    >
      {/* Always present — prevents empty/gray frames while media loads */}
      <div
        className={cn(
          "media-section-atmosphere cinematic-backdrop-atmosphere absolute inset-0",
          `media-section-atmosphere--${atmosphere}`,
          sheen && !reducedMotion && "media-section-atmosphere--sheen",
        )}
      />

      {showStill ? (
        // eslint-disable-next-line @next/next/no-img-element -- editable public paths
        <img
          ref={stillImgRef}
          src={stillUrl!}
          alt={imageAlt}
          decoding={priority ? "sync" : "async"}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          className={mediaClass}
          onLoad={() => setMediaReady(true)}
          onError={() => setMediaReady(true)}
        />
      ) : null}

      {showVideo ? (
        <video
          ref={videoRef}
          className={cn(mediaClass, "cinematic-backdrop-video")}
          autoPlay
          muted
          loop
          playsInline
          preload={priority ? "auto" : "metadata"}
          poster={poster ?? stillSrc ?? undefined}
          onLoadedData={(event) => {
            if (event.currentTarget.readyState >= 2) setMediaReady(true);
          }}
          onError={() => setMediaReady(true)}
        >
          <source src={src!} />
        </video>
      ) : null}

      <div
        className={cn(
          "media-section-overlay absolute inset-0 cinematic-backdrop-overlay",
          getMediaOverlayClass(overlay),
        )}
      />
    </div>
  );
}
