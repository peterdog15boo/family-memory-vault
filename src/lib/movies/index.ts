/**
 * Generated movie helpers — queue a render job from a memory's clean media.
 *
 * SAFETY: movies are created only for memories the user owns. The renderer
 * (`generator.ts`) must pull clean/ready media only (same gates as memory reads).
 */

export type { Movie, MovieStatus, MovieStyle } from "@/lib/db/schema";
export { MOVIE_STATUSES, MOVIE_STYLES } from "@/lib/db/schema";
export { MovieError } from "@/lib/movies/errors";
export {
  DEFAULT_MOVIE_SETTINGS,
  normalizeMovieSettings,
  movieSettingsRequestMusic,
  validateMovieMusicSettings,
  movieSettingsSchema,
  zoomIntensityFactor,
  faceAwareMovieMotionDefaults,
  ensureFaceAwareMovieSettings,
  type MovieSettings,
  type NormalizedMovieSettings,
  type MovieTransition,
  type ZoomIntensity,
  type ColorFilterId,
  type ColorFilterIntensity,
} from "@/lib/movies/settings";
export {
  COLOR_FILTER_CATALOG,
  resolveMovieColorGrade,
  getColorFilter,
  type ColorFilterDefinition,
} from "@/lib/movies/filters";
export {
  createMovieJob,
  updateMovieStatus,
  getMovie,
  deleteMovie,
  type CreateMovieJobInput,
  type UpdateMovieStatusData,
} from "@/lib/movies/lifecycle";
export {
  listUserMovies,
  listUserMoviesWithMemory,
  type MovieWithMemoryTitle,
} from "@/lib/movies/list";
export {
  generateMovie,
  planMovieGeneration,
  loadCleanMemoryMedia,
  hashRenderPlan,
  pickMovieStillKey,
  pickMovieVideoKey,
  type GenerateMovieInput,
  type GenerateMovieResult,
  type MovieClip,
  type MovieRenderPlan,
} from "@/lib/movies/generator";
export {
  resolveMovieTheme,
  listMovieThemes,
  defineTheme,
  registerMovieTheme,
  suggestThemeMusic,
  SIMPLE_THEME,
  HOLIDAY_THEME,
  CINEMATIC_THEME,
  VINTAGE_THEME,
  BRIGHT_THEME,
  BIRTHDAY_THEME,
  type MovieThemeDefinition,
  type ThemeTextOverlayRules,
  type ThemeMusicSuggestion,
  type ThemeColorGrade,
} from "@/lib/movies/themes";
export { MOVIE_PRESETS, getMoviePreset, resolveMoviePresetId } from "@/lib/movies/presets";
export type { MoviePreset, MoviePresetId } from "@/lib/movies/presets";
export {
  MOVIE_LIBRARY_TRACKS,
  getLibraryTrack,
  libraryTrackPreviewUrl,
  resolveSuggestionToLibraryId,
  type MovieLibraryTrack,
} from "@/lib/movies/music/library";
export {
  easeInOutCubic,
  easeKenBurns,
  kenBurnsCrop,
  resolveZoomDirection,
  clipZoomLinearProgress,
  buildKenBurnsTimeline,
  type ZoomDirectionMode,
} from "@/lib/movies/motion";
export {
  computeFramingFromFaces,
  getKenBurnsFraming,
  centerFraming,
  resolveKenBurnsScaleRange,
  resolveMaxZoomFromSubjectBounds,
  type MediaFraming,
} from "@/lib/movies/framing";
export {
  resolveMediaFraming,
  framingFromMediaRow,
  clampFaceBox,
  ensureFaceFramingForRender,
} from "@/lib/movies/framing-cache";
export {
  isMovieFaceDebugEnabled,
  logKenBurnsFaceFocus,
  summarizeCropFocalTracking,
} from "@/lib/movies/face-debug";
export {
  TRANSITION_CATALOG,
  getTransitionCatalogEntry,
  type TransitionCatalogEntry,
} from "@/lib/movies/transition-catalog";
export {
  renderTransitionFrames,
  resolveTransitionDurationMs,
  transitionSampleCount,
  transitionOverlapMs,
  transitionSampleProgress,
} from "@/lib/movies/transitions";
export { applyColorGrade } from "@/lib/movies/effects";
export {
  resolveMovieOutputSpec,
  aspectRatioHint,
  scaleThemeFontSize,
  buildEncodeVideoFilter,
  buildLibx264EncodeArgs,
  appendVideoEdgeFades,
  MOVIE_OPEN_FADE_MS,
  MOVIE_CLOSE_FADE_MS,
  type MovieOutputSpec,
  type EncodeFitMode,
} from "@/lib/movies/output";
export {
  shouldApplyMovieWatermark,
  MOVIE_WATERMARK_LABEL,
} from "@/lib/movies/watermark-policy";
export {
  buildBrandWatermarkOverlay,
  buildBrandWatermarkFfmpegArgs,
} from "@/lib/movies/watermark";
export { composeMoviePoster } from "@/lib/movies/poster";
export {
  serializeMovie,
  type SerializedMovie,
} from "@/lib/movies/serialize";
export {
  movieAspectClass,
  movieDownloadFilename,
} from "@/lib/movies/share";
export {
  assertWithinMovieDailyQuota,
  assertWithinMovieMonthlyQuota,
  getMovieDailyLimit,
  DEFAULT_MOVIE_DAILY_LIMIT,
} from "@/lib/movies/quota";
