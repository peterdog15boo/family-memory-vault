import type { MusicGenerationProvider } from "@/lib/movies/music/ai/types";
import { elevenLabsMusicProvider } from "@/lib/movies/music/ai/providers/elevenlabs";
import { sunoPartnerMusicProvider } from "@/lib/movies/music/ai/providers/suno-partner";
import { MovieError } from "@/lib/movies/errors";

const PROVIDERS: MusicGenerationProvider[] = [
  elevenLabsMusicProvider,
  sunoPartnerMusicProvider,
];

export function listMusicGenerationProviders(): MusicGenerationProvider[] {
  return [...PROVIDERS];
}

export function getMusicGenerationProvider(
  id?: string | null,
): MusicGenerationProvider {
  const preferred =
    id?.trim() ||
    process.env.AI_MUSIC_PROVIDER?.trim() ||
    "elevenlabs";

  const found = PROVIDERS.find((p) => p.id === preferred);
  if (found) return found;

  throw new MovieError(`Unknown music generation provider: ${preferred}`, {
    retryable: false,
    code: "validation",
  });
}

/** First configured provider in preference order (env override first). */
export function resolveConfiguredMusicProvider(
  preferredId?: string | null,
): MusicGenerationProvider | null {
  if (preferredId?.trim()) {
    try {
      const p = getMusicGenerationProvider(preferredId);
      if (p.isConfigured()) return p;
    } catch {
      // fall through
    }
  }

  const envPreferred = process.env.AI_MUSIC_PROVIDER?.trim();
  if (envPreferred) {
    const p = PROVIDERS.find((x) => x.id === envPreferred);
    if (p?.isConfigured()) return p;
  }

  return PROVIDERS.find((p) => p.isConfigured()) ?? null;
}

export function isAiMusicGenerationAvailable(): boolean {
  return PROVIDERS.some((p) => p.isConfigured());
}
