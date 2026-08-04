/**
 * Swappable AI music generation providers.
 *
 * Production providers must be legitimate commercial APIs (ElevenLabs Music,
 * Mubert, SOUNDRAW, or an official Suno partner API). Do not add unofficial
 * Suno reverse-engineered wrappers here.
 */

export const AI_SOUNDTRACK_JOB_TYPE = "movie.ai_soundtrack" as const;

export const AI_SOUNDTRACK_LABEL_PREFIX = "AI-generated soundtrack";

export type MusicGenerationRequest = {
  /** Full prompt sent to the provider (theme + mood + user text). */
  prompt: string;
  /** Desired length in milliseconds (providers clamp to their limits). */
  durationMs: number;
  /** Prefer instrumental beds for movie underscoring. */
  forceInstrumental?: boolean;
  /** Optional seed when the provider supports it. */
  seed?: number;
  /** Provider-specific model id override. */
  modelId?: string;
};

export type MusicGenerationResult = {
  audio: Buffer;
  contentType: string;
  /** File extension without dot (e.g. mp3). */
  extension: string;
  providerId: string;
  providerDisplayName: string;
  /** Provider song / generation id when returned (e.g. response header). */
  providerTrackId?: string | null;
  /** Actual length if known; otherwise requested duration. */
  durationMs?: number;
  modelId?: string;
};

export type MusicGenerationProvider = {
  readonly id: string;
  readonly displayName: string;
  /** True when API keys / env are present. */
  isConfigured(): boolean;
  generate(request: MusicGenerationRequest): Promise<MusicGenerationResult>;
};

export type AiSoundtrackStage =
  | "queued"
  | "generating"
  | "uploading"
  | "ready"
  | "failed";

export type AiSoundtrackJobPayload = {
  userId: string;
  /** Theme / movie style id used for prompt defaults. */
  themeId?: string | null;
  mood?: string | null;
  userPrompt?: string | null;
  durationMs: number;
  forceInstrumental: boolean;
  providerId: string;
  stage: AiSoundtrackStage;
  progressPercent: number;
  statusMessage?: string | null;
  /** Built prompt actually sent (for audit / UI). */
  composedPrompt?: string | null;
  resultKey?: string | null;
  resultContentType?: string | null;
  resultLabel?: string | null;
  providerTrackId?: string | null;
  modelId?: string | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AiSoundtrackGenerateInput = {
  userId: string;
  themeId?: string | null;
  mood?: string | null;
  userPrompt?: string | null;
  /** Movie target duration in seconds — clamped for cost/API limits. */
  durationSeconds: number;
  forceInstrumental?: boolean;
  providerId?: string;
};
