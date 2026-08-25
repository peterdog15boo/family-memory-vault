export {
  isFirstFamilyMovieLocalPreviewEnabled,
  isFirstFamilyMovieLocalPreviewRequest,
  isFirstFamilyMovieOnboardingEnabled,
} from "@/lib/first-family-movie/flags";
export { FIRST_FAMILY_MOVIE_PATH } from "@/lib/routes";
export {
  FFM_SOFT_MIN_PHOTOS,
  FFM_SOFT_TARGET_PHOTOS,
  getGuidedUploadProgressCopy,
} from "@/lib/first-family-movie/guided-upload";
export {
  FFM_CREATE_ANTICIPATION_LINES,
  FFM_LONG_WAIT_MS,
  getCreateAnticipationLine,
} from "@/lib/first-family-movie/create-copy";
export {
  FIRST_MOVIE_FUNNEL_EVENTS,
  isFirstMovieFunnelEvent,
  type FirstMovieFunnelEvent,
} from "@/lib/first-family-movie/funnel";
export { trackFirstMovieEvent } from "@/lib/first-family-movie/track-client";
export {
  completeFirstFamilyMovieIfMovieExists,
  evaluateFirstFamilyMovieEligibility,
  getFirstFamilyMovieEligibility,
  isFirstFamilyMovieComplete,
  markFirstFamilyMovieComplete,
  markFirstFamilyMovieRevealSeen,
  saveFirstFamilyMovieId,
  shouldEnterFirstFamilyMovie,
} from "@/lib/first-family-movie/gate";
