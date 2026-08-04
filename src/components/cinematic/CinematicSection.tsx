import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CinematicBackdrop } from "@/components/cinematic/CinematicBackdrop";
import { GlassPanel } from "@/components/media-section/GlassPanel";
import {
  getMediaLayoutClass,
  type MediaLayoutId,
  type MediaOverlayId,
  type MediaType,
} from "@/lib/media-section/overlays";
import { resolveMediaSection } from "@/lib/media-section/resolve";
import type {
  MediaSectionAtmosphere,
  MediaSectionMediaFilter,
  MediaSectionTreatmentId,
} from "@/lib/media-section/treatments";

export type CinematicSectionProps = {
  children: ReactNode;

  /**
   * @example
   * <CinematicSection mediaType="video" src="…" poster="…" overlay="dark">
   *   …
   * </CinematicSection>
   */
  mediaType?: MediaType;
  /** Image or video source URL */
  src?: string | null;
  /** Poster / reduced-motion still (required for good video UX) */
  poster?: string | null;
  /** Readability overlay — dark/light gradients or named veils */
  overlay?: MediaOverlayId;
  /** Content placement over the media */
  layout?: MediaLayoutId;
  /** Optional frosted content panel */
  glass?: boolean | "soft" | "strong";
  /** Atmosphere when no image/video is set */
  atmosphere?: MediaSectionAtmosphere;
  /** Photographic filter — soft / muted / clear */
  mediaFilter?: MediaSectionMediaFilter;
  /** Eager-load media (heroes / LCP / auth) */
  priority?: boolean;
  /** Full viewport min-height (100svh / 100dvh) */
  viewport?: boolean;

  /**
   * Named visual preset (landing / vault).
   * Fills overlay, atmosphere, and filter defaults; explicit props override.
   */
  treatment?: MediaSectionTreatmentId;

  glassClassName?: string;
  id?: string;
  className?: string;
  contentClassName?: string;
  imageAlt?: string;
  as?: "section" | "div";
  "aria-labelledby"?: string;
};

/**
 * Reusable full-bleed cinematic background for public pages.
 *
 * Supports image + muted looping video (with poster), dark/light overlays,
 * centered or split layouts, optional glass panels, and prefers-reduced-motion
 * still fallbacks. Non-hero media lazy-activates near the viewport.
 */
export function CinematicSection({
  children,
  mediaType,
  src,
  poster,
  overlay,
  layout,
  glass = false,
  atmosphere,
  mediaFilter,
  priority = false,
  viewport = false,
  treatment,
  glassClassName,
  id,
  className,
  contentClassName,
  imageAlt,
  as: Tag = "section",
  "aria-labelledby": ariaLabelledBy,
}: CinematicSectionProps) {
  const resolved = resolveMediaSection({
    mediaType,
    src,
    poster,
    overlay,
    layout,
    atmosphere,
    mediaFilter,
    treatment,
  });

  const glassMode =
    glass === true ? "soft" : glass === false ? null : glass;

  const body = glassMode ? (
    <GlassPanel strength={glassMode} className={glassClassName}>
      {children}
    </GlassPanel>
  ) : (
    children
  );

  return (
    <Tag
      id={id}
      aria-labelledby={ariaLabelledBy}
      className={cn(
        "media-section cinematic-section relative overflow-hidden",
        viewport && "cinematic-section--viewport",
        treatment && `media-section--${treatment}`,
        getMediaLayoutClass(resolved.layout),
        className,
      )}
    >
      <CinematicBackdrop
        mediaType={resolved.mediaType}
        src={resolved.src}
        poster={resolved.poster}
        overlay={resolved.overlay}
        atmosphere={resolved.atmosphere}
        mediaFilter={resolved.mediaFilter}
        sheen={resolved.sheen}
        imageAlt={imageAlt}
        priority={priority}
      />
      <div
        className={cn(
          "media-section-content cinematic-section-content relative z-10",
          contentClassName,
        )}
      >
        {body}
      </div>
    </Tag>
  );
}
