import {
  CinematicSection,
  type CinematicSectionProps,
} from "@/components/cinematic/CinematicSection";

/**
 * @deprecated Prefer `CinematicSection` from `@/components/cinematic`.
 * Kept as a thin alias so existing vault / onboarding call sites keep working.
 */
export type MediaSectionProps = CinematicSectionProps & {
  /** @deprecated Prefer `src` + mediaType="image" */
  imageSrc?: string | null;
  /** @deprecated Prefer `src` + mediaType="video" */
  videoSrc?: string | null;
  /** @deprecated Prefer `poster` */
  posterSrc?: string | null;
  /** @deprecated Prefer glass="soft" | "strong" */
  glassStrength?: "soft" | "strong";
};

/**
 * @deprecated Prefer `CinematicSection` from `@/components/cinematic`.
 */
export function MediaSection({
  children,
  imageSrc,
  videoSrc,
  posterSrc,
  glassStrength,
  glass,
  src,
  poster,
  mediaType,
  ...rest
}: MediaSectionProps) {
  const resolvedSrc = src ?? videoSrc ?? imageSrc ?? null;
  const resolvedPoster = poster ?? posterSrc ?? imageSrc ?? null;
  const resolvedType =
    mediaType ??
    (videoSrc || (src && /\.(mp4|webm|ogg|mov)(\?|$)/i.test(src))
      ? "video"
      : imageSrc || src
        ? "image"
        : undefined);
  const resolvedGlass =
    glass === true ? (glassStrength ?? "soft") : glass;

  return (
    <CinematicSection
      {...rest}
      mediaType={resolvedType}
      src={resolvedSrc}
      poster={resolvedPoster}
      glass={resolvedGlass}
    >
      {children}
    </CinematicSection>
  );
}
