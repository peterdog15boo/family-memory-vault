export {
  AI_SOUNDTRACK_JOB_TYPE,
  AI_SOUNDTRACK_LABEL_PREFIX,
  type AiSoundtrackGenerateInput,
  type AiSoundtrackJobPayload,
  type AiSoundtrackStage,
  type MusicGenerationProvider,
  type MusicGenerationRequest,
  type MusicGenerationResult,
} from "@/lib/movies/music/ai/types";
export {
  buildAiSoundtrackLabel,
  buildAiSoundtrackPrompt,
} from "@/lib/movies/music/ai/prompt";
export {
  AI_SOUNDTRACK_MAX_DURATION_MS,
  AI_SOUNDTRACK_MIN_DURATION_MS,
  clampAiSoundtrackDurationMs,
  generateAndStoreAiSoundtrack,
} from "@/lib/movies/music/ai/generate";
export {
  getMusicGenerationProvider,
  isAiMusicGenerationAvailable,
  listMusicGenerationProviders,
  resolveConfiguredMusicProvider,
} from "@/lib/movies/music/ai/registry";
export {
  enqueueAiSoundtrackJob,
  getAiSoundtrackJobForUser,
  processAiSoundtrackJob,
  serializeAiSoundtrackJob,
} from "@/lib/movies/music/ai/jobs";
