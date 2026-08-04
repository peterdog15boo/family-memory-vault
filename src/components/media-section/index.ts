export {
  MediaSection,
  type MediaSectionProps,
} from "@/components/media-section/MediaSection";
/** @deprecated Prefer CinematicBackdrop from `@/components/cinematic` */
export {
  MediaBackdrop,
  type MediaBackdropProps,
} from "@/components/media-section/MediaBackdrop";
export { GlassPanel } from "@/components/media-section/GlassPanel";
export { usePrefersReducedMotion } from "@/components/media-section/usePrefersReducedMotion";
export {
  MEDIA_SECTION_TREATMENTS,
  MEDIA_SECTION_ASSET_GUIDANCE,
  getMediaSectionTreatment,
  type MediaSectionTreatmentId,
  type MediaSectionAtmosphere,
} from "@/lib/media-section/treatments";
export {
  MEDIA_OVERLAYS,
  MEDIA_LAYOUTS,
  getMediaOverlayClass,
  getMediaLayoutClass,
  type MediaOverlayId,
  type MediaLayoutId,
  type MediaType,
} from "@/lib/media-section/overlays";
export {
  resolveMediaSection,
  type ResolveMediaSectionInput,
  type ResolvedMediaSection,
} from "@/lib/media-section/resolve";

/** Prefer this for new public-page work */
export {
  CinematicSection,
  type CinematicSectionProps,
} from "@/components/cinematic";
