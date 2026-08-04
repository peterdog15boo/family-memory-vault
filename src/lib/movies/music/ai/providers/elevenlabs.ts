/**
 * ElevenLabs Music — official Compose API.
 * Docs: https://elevenlabs.io/docs/api-reference/music/compose
 *
 * Env: ELEVENLABS_API_KEY (required)
 * Optional: ELEVENLABS_MUSIC_MODEL (music_v1 | music_v2), ELEVENLABS_API_BASE
 */

import type {
  MusicGenerationProvider,
  MusicGenerationRequest,
  MusicGenerationResult,
} from "@/lib/movies/music/ai/types";
import { MovieError } from "@/lib/movies/errors";

const DEFAULT_BASE = "https://api.elevenlabs.io";
const MIN_MS = 3_000;
const MAX_MS = 600_000;

function apiKey(): string | null {
  const key =
    process.env.ELEVENLABS_API_KEY?.trim() ||
    process.env.ELEVEN_LABS_API_KEY?.trim();
  return key || null;
}

function baseUrl(): string {
  return (
    process.env.ELEVENLABS_API_BASE?.trim().replace(/\/$/, "") || DEFAULT_BASE
  );
}

function modelId(override?: string): "music_v1" | "music_v2" {
  const raw =
    override?.trim() ||
    process.env.ELEVENLABS_MUSIC_MODEL?.trim() ||
    "music_v1";
  return raw === "music_v2" ? "music_v2" : "music_v1";
}

function clampDurationMs(ms: number): number {
  if (!Number.isFinite(ms)) return 45_000;
  return Math.min(MAX_MS, Math.max(MIN_MS, Math.round(ms)));
}

export const elevenLabsMusicProvider: MusicGenerationProvider = {
  id: "elevenlabs",
  displayName: "ElevenLabs Music",

  isConfigured(): boolean {
    return Boolean(apiKey());
  },

  async generate(
    request: MusicGenerationRequest,
  ): Promise<MusicGenerationResult> {
    const key = apiKey();
    if (!key) {
      throw new MovieError(
        "AI soundtrack is not configured. Set ELEVENLABS_API_KEY.",
        { retryable: false, code: "validation" },
      );
    }

    const prompt = request.prompt?.trim();
    if (!prompt || prompt.length < 8) {
      throw new MovieError("Music prompt is too short.", {
        retryable: false,
        code: "validation",
      });
    }

    const durationMs = clampDurationMs(request.durationMs);
    const model = modelId(request.modelId);
    const url = `${baseUrl()}/v1/music?output_format=mp3_44100_128`;

    const body: Record<string, unknown> = {
      prompt,
      music_length_ms: durationMs,
      model_id: model,
      force_instrumental: request.forceInstrumental !== false,
    };
    // Seed cannot be used with prompt per ElevenLabs docs — omit intentionally.

    const controller = new AbortController();
    const timeoutMs = Number(process.env.ELEVENLABS_MUSIC_TIMEOUT_MS ?? 180_000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": key,
          Accept: "audio/mpeg, application/octet-stream",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new MovieError(
          "Music generation timed out. Try a shorter duration.",
          { retryable: true, code: "validation" },
        );
      }
      throw new MovieError(
        err instanceof Error
          ? err.message
          : "Could not reach the music generation service.",
        { retryable: true },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const text = await response.text();
        if (text) detail = text.slice(0, 500);
      } catch {
        // ignore
      }
      const retryable = response.status === 429 || response.status >= 500;
      throw new MovieError(
        `Music generation failed (${this.displayName}): ${detail}`,
        { retryable, code: retryable ? undefined : "validation" },
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const audio = Buffer.from(arrayBuffer);
    if (audio.byteLength < 256) {
      throw new MovieError("Music provider returned empty audio.", {
        retryable: true,
      });
    }

    const providerTrackId =
      response.headers.get("song-id") ||
      response.headers.get("x-song-id") ||
      response.headers.get("request-id") ||
      null;

    return {
      audio,
      contentType: "audio/mpeg",
      extension: "mp3",
      providerId: this.id,
      providerDisplayName: this.displayName,
      providerTrackId,
      durationMs,
      modelId: model,
    };
  },
};
