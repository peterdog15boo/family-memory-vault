/**
 * Orchestrate AI soundtrack generation → R2 under movies/{userId}/music/.
 */

import { nanoid } from "nanoid";
import { putObjectBytes } from "@/lib/r2";
import { MovieError } from "@/lib/movies/errors";
import {
  buildAiSoundtrackLabel,
  buildAiSoundtrackPrompt,
} from "@/lib/movies/music/ai/prompt";
import { resolveConfiguredMusicProvider } from "@/lib/movies/music/ai/registry";
import type {
  AiSoundtrackGenerateInput,
  MusicGenerationResult,
} from "@/lib/movies/music/ai/types";
import { buildMovieMusicKey } from "@/lib/movies/music/upload";

/** Soft cost cap — longer movies still loop the bed via mix settings. */
export const AI_SOUNDTRACK_MAX_DURATION_MS = (() => {
  const raw = Number(process.env.AI_SOUNDTRACK_MAX_DURATION_MS ?? 180_000);
  if (!Number.isFinite(raw) || raw < 10_000) return 180_000;
  return Math.min(Math.floor(raw), 600_000);
})();

export const AI_SOUNDTRACK_MIN_DURATION_MS = 10_000;

export function clampAiSoundtrackDurationMs(durationSeconds: number): number {
  const ms = Math.round(
    (Number.isFinite(durationSeconds) ? durationSeconds : 45) * 1000,
  );
  return Math.min(
    AI_SOUNDTRACK_MAX_DURATION_MS,
    Math.max(AI_SOUNDTRACK_MIN_DURATION_MS, ms),
  );
}

export type StoredAiSoundtrack = {
  key: string;
  contentType: string;
  sizeBytes: number;
  label: string;
  durationMs: number;
  providerId: string;
  providerDisplayName: string;
  providerTrackId: string | null;
  modelId: string | null;
  composedPrompt: string;
};

export async function generateAndStoreAiSoundtrack(
  input: AiSoundtrackGenerateInput,
  options?: {
    onProgress?: (stage: "generating" | "uploading", message: string) => void | Promise<void>;
  },
): Promise<StoredAiSoundtrack> {
  const provider = resolveConfiguredMusicProvider(input.providerId);
  if (!provider) {
    throw new MovieError(
      "AI soundtrack generation is not configured. Set ELEVENLABS_API_KEY (or another supported provider).",
      { retryable: false, code: "validation" },
    );
  }

  const durationMs = clampAiSoundtrackDurationMs(input.durationSeconds);
  const composedPrompt = buildAiSoundtrackPrompt({
    themeId: input.themeId,
    mood: input.mood,
    userPrompt: input.userPrompt,
  });

  await options?.onProgress?.(
    "generating",
    `Generating with ${provider.displayName}…`,
  );

  const generated: MusicGenerationResult = await provider.generate({
    prompt: composedPrompt,
    durationMs,
    forceInstrumental: input.forceInstrumental !== false,
  });

  await options?.onProgress?.("uploading", "Saving soundtrack…");

  const uploadId = nanoid();
  const key = `${buildMovieMusicKey(input.userId, uploadId)}.${generated.extension}`;
  const put = await putObjectBytes(key, generated.audio, {
    contentType: generated.contentType,
    cacheControl: "private, max-age=31536000",
  });

  return {
    key: put.key,
    contentType: generated.contentType,
    sizeBytes: put.byteSize,
    label: buildAiSoundtrackLabel(input.userPrompt),
    durationMs: generated.durationMs ?? durationMs,
    providerId: generated.providerId,
    providerDisplayName: generated.providerDisplayName,
    providerTrackId: generated.providerTrackId ?? null,
    modelId: generated.modelId ?? null,
    composedPrompt,
  };
}
