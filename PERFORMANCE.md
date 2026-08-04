# Performance notes

Practical defaults for Family Memory Vault hot paths.

## Database

- Gallery / library queries filter on `user_id` + `moderation_status` + `status` and order by `created_at` (existing composite indexes on `media`).
- Added indexes (migration `0016_perf_indexes`):
  - `memories (user_id, shared_with_family, created_at)` — shared memory lists
  - `people (user_id, updated_at)` — people list
  - `faces (user_id, person_id, created_at)` — person photo galleries
- Apply with: `npx tsx scripts/apply-0016-perf-indexes.ts`

## Request caching

- `getAccessibleOwnerIds` and `getUserPlan` use React `cache()` so layout, dashboard, and gates share one DB lookup per request.

## Pagination

- Media library: first page 48 items server-rendered; **Load more** via `GET /api/media/library`.
- Memories library: same pattern via `GET /api/memories/library`.
- Dashboard keeps small previews (12 media / 6 memories).
- Person detail caps distinct photos at 100 (newest first).

## Images / signed URLs

- Gallery previews use thumbnail → processed → original keys with a **30-minute** signed TTL (`GALLERY_PREVIEW_EXPIRES_IN_SECONDS`), under the 1-hour R2 hard cap.
- Grid `<img>` tags use `loading="lazy"`, `decoding="async"`, and responsive `sizes`.
- Gallery tiles are `memo`ized so opening the lightbox does not re-render every tile.

## Background work (non-blocking)

- Upload complete (`POST /api/media/complete`) promotes the object, inserts `pending` media, enqueues a moderation job, then returns. Workers drain `processing_jobs`.
- Movie create inserts a `queued` movie and enqueues `movie.render`, then returns. Rendering is worker-only.

Keep workers running in production (`worker:moderation`, `worker:faces`, `worker:movies`) so the web app stays responsive.
