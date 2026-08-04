export {
  MOVIE_LIBRARY_TRACKS,
  MUSIC_CATEGORIES,
  MUSIC_CATEGORY_LABELS,
  LIBRARY_MUSIC_LICENSE,
  LIBRARY_MUSIC_ASSET_VERSION,
  getLibraryTrack,
  libraryTrackPreviewUrl,
  listLibraryTracksByCategory,
  resolveSuggestionToLibraryId,
  type MovieLibraryTrack,
  type MusicCategory,
} from "@/lib/movies/music/library";
export { resolveMovieMusic, type ResolvedMovieMusic } from "@/lib/movies/music/resolve";
export { mixMovieAudio } from "@/lib/movies/music/mix";
export {
  MOVIE_MUSIC_ALLOWED_TYPES,
  MOVIE_MUSIC_MAX_BYTES,
  createMovieMusicUploadUrl,
  completeMovieMusicUpload,
  createMovieMusicPreviewUrl,
  movieMusicUploadRequestSchema,
  isMovieMusicKeyForUser,
  type MovieMusicContentType,
} from "@/lib/movies/music/upload";
export {
  AI_SOUNDTRACK_JOB_TYPE,
  AI_SOUNDTRACK_LABEL_PREFIX,
  buildAiSoundtrackPrompt,
  clampAiSoundtrackDurationMs,
  isAiMusicGenerationAvailable,
  listMusicGenerationProviders,
} from "@/lib/movies/music/ai";
