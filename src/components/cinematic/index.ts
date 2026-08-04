/**
 * Public cinematic background system for marketing / auth pages.
 *
 * @example
 * <CinematicSection mediaType="video" src="…" poster="…" overlay="dark">
 *   …
 * </CinematicSection>
 */

export {
  CinematicSection,
  type CinematicSectionProps,
} from "@/components/cinematic/CinematicSection";
export {
  CinematicBackdrop,
  type CinematicBackdropProps,
} from "@/components/cinematic/CinematicBackdrop";
export { GlassPanel } from "@/components/media-section/GlassPanel";
export { usePrefersReducedMotion } from "@/components/media-section/usePrefersReducedMotion";
export {
  MEDIA_OVERLAYS,
  MEDIA_LAYOUTS,
  getMediaOverlayClass,
  getMediaLayoutClass,
  type MediaOverlayId as CinematicOverlayId,
  type MediaLayoutId as CinematicLayoutId,
  type MediaType as CinematicMediaType,
} from "@/lib/media-section/overlays";
