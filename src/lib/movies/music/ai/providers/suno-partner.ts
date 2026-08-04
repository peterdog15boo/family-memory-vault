/**
 * Official Suno partner API — stub only.
 *
 * Do NOT wire unofficial / reverse-engineered Suno HTTP clients here.
 * When Suno (or a licensed partner) publishes a documented partner API:
 *
 * 1. Set SUNO_PARTNER_API_KEY (+ base URL / model) in env
 * 2. Implement `generate()` against their OpenAPI contract
 * 3. Register the provider in `registry.ts` and optionally set
 *    AI_MUSIC_PROVIDER=suno_partner
 * 4. Keep force_instrumental / no-vocals defaults for movie underscoring
 *
 * Until then, this provider reports not configured and refuses generation.
 */

import type {
  MusicGenerationProvider,
  MusicGenerationRequest,
  MusicGenerationResult,
} from "@/lib/movies/music/ai/types";
import { MovieError } from "@/lib/movies/errors";

export const sunoPartnerMusicProvider: MusicGenerationProvider = {
  id: "suno_partner",
  displayName: "Suno (official partner API)",

  isConfigured(): boolean {
    return Boolean(process.env.SUNO_PARTNER_API_KEY?.trim());
  },

  async generate(
    _request: MusicGenerationRequest,
  ): Promise<MusicGenerationResult> {
    if (!this.isConfigured()) {
      throw new MovieError(
        "Official Suno partner API is not available yet. Use ElevenLabs Music, or wait for SUNO_PARTNER_API_KEY + a documented partner integration.",
        { retryable: false, code: "validation" },
      );
    }

    // Placeholder — replace with real partner HTTP once credentials + docs exist.
    throw new MovieError(
      "Suno partner provider is stubbed. Implement against the official partner OpenAPI before enabling in production.",
      { retryable: false, code: "validation" },
    );
  },
};
