# Generated Movies

Family Memory Vault can turn a memory’s **clean** photos into a short themed film (slideshow MP4), stored privately in R2 and played via short-lived signed URLs.

See also [SAFETY.md](./SAFETY.md) (clean-only gates) and [FAMILY_SHARING.md](./FAMILY_SHARING.md) (movies are **owner-only** today — not shared with family).

---

## How it works

```
Owner opens Memory Detail → Create Movie
  → POST /api/memories/[id]/movies
       • ownership check (memory.user_id)
       • plan monthly movie quota + daily burst + concurrent job limits
       • advanced theme gate (cinematic requires Family+)
       • requires ≥1 clean/ready media in the memory
       • insert movies row status=queued
       • enqueue processing_jobs type=movie.render
  → after() best-effort drain (dev) and/or npm run worker:movies
  → Worker:
       1. Claim movie.render
       2. generateMovie() — load clean media only → frames (sharp) → ffmpeg MP4
       3. Upload to R2 movies/{userId}/{movieId}/
       4. movies.status = ready | failed
  → UI polls GET /api/movies/[id] → play / download with signed URLs
```

### Pipeline modules

| Piece | Path |
| --- | --- |
| Schema | `movies` table (`src/lib/db/schema.ts`, migration `0008_movies`) |
| Create / status / delete | `src/lib/movies/lifecycle.ts` |
| Themes | `src/lib/movies/themes.ts` (`defineTheme`) |
| Output profiles | `src/lib/movies/output.ts` (1080p / 4K / social aspects) |
| Poster | `src/lib/movies/poster.ts` |
| Generator | `src/lib/movies/generator.ts` |
| Quotas | `src/lib/movies/quota.ts` |
| Worker | `src/workers/movies.ts` |
| UI | Create panel, `/movies`, Memory Detail Movies section |

### Export quality

Default export is **1080p** (social-ready). Aspect presets: **16:9**, **1:1**, **9:16**.

| Quality mode | Landscape | Vertical | Square | Encode |
| --- | --- | --- | --- | --- |
| `fast` | 1280×720 | 720×1280 | 1080×1080 | CRF ~21, veryfast, VBV 6M |
| `standard` (default) | 1920×1080 | 1080×1920 | 1080×1080 | CRF ~16, slow, high 4.1, VBV 12M |
| `ultra` (Family+ `priorityRender`) | 3840×2160 | 2160×3840 | 2160×2160 | CRF ~15, slow, high 5.1, VBV 45M |

Pipeline: sharp frames (display/original stills, **Lanczos** scale, **duration-driven Ken Burns** at encode fps with **face-aware focal framing** when People/face boxes exist + **cinematic color filter** grade) → **baked clip transitions** (`src/lib/movies/transitions.ts`, sampled at encode fps) → ffmpeg libx264 (`yuv420p`, Rec.709 tags, `+faststart`, lanczos `scale` + `fps=` filter so concat durations are honored) → optional **soundtrack mix** (library or upload: loop, fade in/out, soft ducking when video audio exists) → R2. Each ready movie also gets a composed poster JPEG (up to 1920 long-edge, high-quality JPEG).

Set `MOVIE_FAST_RENDER=true` only when you need a temporary speed override (forces `fast`).

### Color filters

Presets (Create Movie): Clean / Natural, Warm Family, Golden Hour, Cinematic Teal-Orange, Vintage Film, Soft Glow, Black & White, Holiday Bright, Dreamy Pastel. Intensity (subtle / medium / strong) plus grain and vignette toggles. Grades are resolved in `src/lib/movies/filters.ts` and applied by `effects.ts` on every export frame (modulate + contrast + tint / split-tone / glow / vignette / light leak / grain).

### Transitions

Styles (Create Movie + theme defaults): crossfade, soft dissolve, soft cut, fade through black/white, slide left/right, gentle push, zoom through, blur dissolve, light leak wipe, hard cut. Duration is configurable (theme default / short / medium / long). Transitions are rendered as full frame sequences before ffmpeg — not CSS-only preview effects.

### Themes (v1)

- **Simple** — soft dissolve, gentle zoom  
- **Holiday** — light-leak wipe, warm grade  
- **Cinematic** — fade through black, letterbox, slower pacing  
- **Birthday** — gentle push, celebratory overlays  

### Production presets

Create Movie presets only set parameters (no separate render path): Classic Family, Holiday Card, Cinematic Tribute, Social Story (9:16), Clean Slideshow.

---

## Safety guarantees

### Only clean media enters a movie

1. **Create** refuses memories with zero clean/ready items (`countCleanMemoryMedia`).
2. **Generator** loads slides with `cleanReadyMediaFilter(ownerUserId)` (`moderation_status = clean` **and** `status = ready`, owned by the memory owner).
3. **Defense in depth** — each row is re-checked with `isSafeToServe` + `status === "ready"`; quarantine / `temp/` keys are never used as still sources.
4. `getObjectBytes` refuses `quarantine/` keys.

Pending, adult, rejected, `needs_human_review`, and CSAM-quarantined media **cannot** appear in generated films.

### Signed URLs

- Playback/download uses `getMovieDownloadUrl()` — **not** the worker-only `getInternalDownloadUrl()`.
- Keys must live under `movies/{userId}/{movieId}/`.
- Default TTL **5 minutes** (hard max **10 minutes** for movie URLs).
- APIs re-sign on each `GET /api/movies/[id]` / list; the player refreshes before play.
- Bucket stays private; no long-lived public movie URLs.

### Ownership

- Create / list / play / delete: **owner only** (`movies.user_id`).
- Family contributors can edit memory media (when allowed) but **cannot** create or view another member’s movies in v1.

---

## Quotas

Plan monthly limits come from the user’s subscription (`plans.max_movies_per_month`). See [BILLING.md](./BILLING.md).

| Limit | Source | Notes |
| --- | --- | --- |
| Movies per calendar month (UTC) | Plan (Free 5 · Family 30 · Family Plus 100 · Legacy 200) | Enforced in `assertWithinMovieMonthlyQuota` / `canCreateMovie` **before** enqueue |
| Movies per UTC day (burst) | Env `MOVIE_DAILY_LIMIT` (default **10**) | Soft anti-spam on top of monthly |
| Concurrent pending/processing `movie.render` jobs | `min(plan.max_active_movie_jobs, MOVIE_ACTIVE_JOB_LIMIT)` · env default **3** | Plan + env ceiling aligned in gates and quota helpers |

Exceeded limits return **HTTP 403** with `code: plan_limit` or `quota_exceeded` and friendly upgrade copy (UI uses `UpgradePrompt`).

Warnings appear in the create-movie panel and on `/billing` when monthly usage reaches **≥80%**.

---

## Running the worker

```bash
npm run worker:movies
```

Or drain once: `POST /api/jobs/movies` with `Authorization: Bearer $WORKER_SECRET`.

Local Create Movie also kicks a background drain via Next.js `after()` that keeps
processing until **that** movie is ready/failed (clears older backlog jobs first).
Still prefer the long-running worker for reliable encodes if you create several films.

Requires `ffmpeg-static` (installed with npm). Path resolution avoids Next’s broken `.next/vendor-chunks` rewrite; optional override: `FFMPEG_PATH`.

---

## Current limitations

- **Photos / video posters only** — full video clip trim is not implemented (ducking is ready when video audio arrives).
- **Library tracks** are a curated Kevin MacLeod (CC BY 4.0) catalog under `public/music/library/` — categories: Warm / Family, Cinematic, Holiday, Upbeat, Soft Piano, Memorial / Reflective, Bright Social. Rebuild with `python scripts/generate-library-music.py`, or replace files in place (bump `LIBRARY_MUSIC_ASSET_VERSION` for preview cache). Picker shows title + mood tags, preview, volume, fade, and loop; selection persists on `movies.settings`.
- **Not family-shared** — movies do not appear for co-members.
- **Ultra 4K** is plan-gated (`priorityRender`) and slower to render.
- **Serverless timeouts** — large albums / 4K should use `npm run worker:movies`, not only the API drain.
- **No AI highlight selection** yet — clips follow memory sort order (capped).

---

## API cheat sheet

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/memories/[id]/movies` | Queue a movie (owner) |
| `GET` | `/api/memories/[id]/movies` | List for one memory |
| `GET` | `/api/movies` | List all my movies |
| `GET` | `/api/movies/[id]` | Status + signed URLs |
| `DELETE` | `/api/movies/[id]` | Delete row + R2 objects |
| `GET` | `/api/movies/music/library` | Built-in soundtrack catalog |
| `POST` | `/api/movies/music/upload-url` | Presign music upload |
| `POST` | `/api/movies/music/complete` | Promote uploaded track |
| `POST` | `/api/movies/music/preview-url` | Signed preview for upload |
| `POST` | `/api/jobs/movies` | Worker drain (secret) |
