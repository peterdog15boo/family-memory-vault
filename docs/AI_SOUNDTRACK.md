# AI movie soundtracks

Optional **Generate soundtrack for this movie** flow. Audio is produced by a
**legitimate commercial music API**, stored in private R2, and mixed as
background music on export. The UI always labels results as
**AI-generated soundtrack**.

## Architecture

```
UI (MovieMusicPicker)
  → POST /api/movies/music/generate
  → processing_jobs type `movie.ai_soundtrack`
  → provider.generate()  (MusicGenerationProvider)
  → putObjectBytes → movies/{userId}/music/{id}.mp3
  → GET /api/movies/music/generate/[jobId]  (progress)
  → movie settings: musicSource=upload + musicAiGenerated=true
  → resolve/mix on render (same path as user uploads)
```

### Provider interface

Swappable providers live under `src/lib/movies/music/ai/`:

| File | Role |
|------|------|
| `types.ts` | `MusicGenerationProvider` contract + job payload |
| `registry.ts` | Resolve provider by id / `AI_MUSIC_PROVIDER` |
| `providers/elevenlabs.ts` | **Production** — ElevenLabs Music Compose API |
| `providers/suno-partner.ts` | Stub for a future **official** Suno partner API |
| `prompt.ts` | Theme / mood / user text → generation prompt |
| `generate.ts` | Generate + store in R2 |
| `jobs.ts` | Queue + progress stages |

To add Mubert, SOUNDRAW, or another licensed API: implement
`MusicGenerationProvider`, register it in `registry.ts`, and set
`AI_MUSIC_PROVIDER` (or pass `providerId` on the API).

**Do not** add unofficial / reverse-engineered Suno HTTP wrappers.

## Current production provider — ElevenLabs Music

- Endpoint: `POST https://api.elevenlabs.io/v1/music`
- Docs: https://elevenlabs.io/docs/api-reference/music/compose
- Defaults: `force_instrumental: true`, `music_v1`, MP3 output
- Duration: movie target length, clamped (default max **180s**; see env)

### Env

```bash
# Required for generation
ELEVENLABS_API_KEY=sk_...

# Optional
# AI_MUSIC_PROVIDER=elevenlabs
# ELEVENLABS_MUSIC_MODEL=music_v1   # or music_v2
# ELEVENLABS_API_BASE=https://api.elevenlabs.io
# ELEVENLABS_MUSIC_TIMEOUT_MS=180000
# AI_SOUNDTRACK_MAX_DURATION_MS=180000
```

Without `ELEVENLABS_API_KEY`, the API returns a clear “not configured” error;
library + upload music still work.

## Plan limits

Catalog flags (`plans.features`):

| Plan | `aiSoundtrack` | `maxAiSoundtracksPerMonth` |
|------|----------------|----------------------------|
| Free | false | 0 |
| Family | true | 5 |
| Family Plus | true | 25 |
| Legacy | true | 100 |

Gates: `canGenerateAiSoundtrack` in `src/lib/plans/gates.ts`.
Re-seed / update plan rows in Neon if existing DB features JSON lacks these keys.

## Movie settings

AI tracks reuse the upload mixer path:

- `musicSource: "upload"`
- `musicUploadKey`: R2 key
- `musicAiGenerated: true`
- `musicAiProvider`: e.g. `"elevenlabs"`
- `musicLabel`: starts with `AI-generated soundtrack`

## Applying official Suno later

When Suno (or a licensed partner) publishes a documented partner API:

1. Obtain partner credentials; set `SUNO_PARTNER_API_KEY` (+ base URL / model as docs require).
2. Implement `sunoPartnerMusicProvider.generate()` against their OpenAPI (replace the stub).
3. Register remains in `registry.ts`; set `AI_MUSIC_PROVIDER=suno_partner` to prefer it.
4. Keep instrumental / no-vocals defaults for family movie underscoring.
5. Confirm commercial license terms cover private family movie exports.
6. Do **not** ship reverse-engineered public-web Suno clients.

See comments in `src/lib/movies/music/ai/providers/suno-partner.ts`.

## Ops notes

- Generation runs in the request’s `after()` callback (same pattern as other
  background Next work). Long timeouts need a host that keeps the isolate alive
  long enough; otherwise run `processAiSoundtrackJob` from a worker.
- Costs are metered by the music vendor — monthly plan caps exist to limit spend.
- Preview uses the same signed URL path as uploaded tracks.
