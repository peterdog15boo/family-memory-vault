# Faces & People

Family Memory Vault groups faces in **your** photos so you can name the people you love. Face recognition is a private organization feature — not a social graph, not advertising, and never shared across accounts.

**Policy in one sentence:** Face detection runs only on photos and videos you own that are already `moderation_status = clean` **and** `status = ready`. People and face rows are always scoped to your user id. Pending, rejected, adult, review-held, and quarantined media are never scanned for faces, and face data is removed if media later leaves the clean set.

**Family sharing:** Joining a household does **not** expose your People library. Co-members cannot list or open your people/faces. See [FAMILY_SHARING.md](./FAMILY_SHARING.md).

Related: [SAFETY.md](./SAFETY.md) (moderation gates that must pass first).

---

## End-to-end flow

```
Upload → moderation worker → clean / ready
  → maybeEnqueueFaceDetectionForMedia  (best-effort; never blocks moderation)
  → processing_jobs type = face.detect
  → npm run worker:faces  (or POST /api/jobs/faces)
       1. detectAndStoreFacesForMedia   (clean/ready photo or video frames)
       2. groupFaces                    (assign or create Person)
  → /people  (owner-only UI)
```

Detection and grouping run on a **separate** queue from moderation so upload safety is never delayed by face work.

---

## Clean-only gate

| Layer | Rule |
| --- | --- |
| `assertCleanVisualMedia` / `detectAndStoreFacesForMedia` | Soft-skip unless clean + ready + photo/video |
| `createFace` | Hard-rejects unclean / non photo-or-video media |
| `maybeEnqueueFaceDetectionForMedia` | Enqueues only for eligible clean photos/videos |
| `enqueueFaceDetectionJob` | Refuses enqueue unless clean/ready photo or video owned by `userId` |
| People UI / queries | Galleries and covers use `cleanReadyMediaFilter(userId)` |
| Leaving clean / quarantine | `deleteFacesForMedia` removes face rows (and clears covers) |

Videos are face-detected by sampling a few representative frames with ffmpeg (`VIDEO_ANALYSIS_MAX_FRAMES`, default 5). Each face stores `source_frame_ms` so identity matching can crop the same frame and link the video to an existing Person. Frame extraction failures skip that video without blocking upload. Linked videos appear on the Person detail gallery next to photos (owner-scoped, clean/ready only).

---

## Ownership & privacy

1. **Per-account only** — Every `people` and `faces` row has `user_id`. Helpers and `/api/people*` always pass the signed-in Clerk user id; non-owners get `404 Person not found`.
2. **No cross-user visibility** — Your people list, merges, and cover faces cannot include another account’s media or identities.
3. **What we store** — Bounding box, optional embedding / vendor face token, confidence, provider label, and the person name you choose. Used only to organize photos inside your vault.
4. **What we don’t do** — Face data is not shown to other users, not used for ads, and not mixed across vaults.
5. **UI reminder** — `/people` states: *“Face recognition is only used within your account to help organize your family photos…”*

Middleware protects `/people(.*)` and `/api/people(.*)`.

---

## Grouping (how “Person” works)

With **Rekognition** live (`FACE_DETECTION_ENABLED=true`, provider `rekognition`), faces are matched with AWS Face Collections (`IndexFaces` / `SearchFacesByImage`) — real identity matching across photos. Set `FACE_IDENTITY_MATCHING=false` to disable.

Fallback / offline path:
1. New faces are scored against each of **your** existing people (embedding centroid / similarity helpers in `src/lib/faces/similarity.ts`).
2. Score ≥ match threshold → assign to that person.
3. Otherwise → create a new person (auto label like `Person 3`, shown as “Unnamed Person” until you rename).
4. You can rename, set a cover face, merge people, and start a Memory from a person’s clean photos.

Thresholds: `FACE_IDENTITY_MATCH_THRESHOLD` (Rekognition similarity 0–100, default 95), `FACE_GROUPING_MATCH_THRESHOLD` / `FACE_GROUPING_MERGE_THRESHOLD` for the embedding fallback.

Rebuild after a bad backfill: `npm run regroup:faces -- --userId=<id>` (uses identity matching when live Rekognition is enabled).

---

## Providers

| Env | Purpose |
| --- | --- |
| `FACE_DETECTION_ENABLED=true` | Use live provider when credentials exist |
| `FACE_DETECTION_PROVIDER` | `rekognition` \| `google_vision` \| `mock` |
| `FACE_DETECTION_MIN_CONFIDENCE` | Rekognition min confidence (optional) |
| `FACE_IDENTITY_MATCHING` | `false` to disable Index/Search identity matching |
| `FACE_IDENTITY_MATCH_THRESHOLD` | SearchFaces similarity 0–100 (default 95) |

When live detection is off, the **mock** provider still runs so local People UI can be exercised safely.

---

## Ops

| Command / route | Purpose |
| --- | --- |
| `npm run worker:faces` | Poll / process `face.detect` jobs |
| `POST /api/jobs/faces` | One-shot drain (Bearer `WORKER_SECRET`) |
| `npm run detect:faces -- --mediaId=<id>` | Inline detect + group (dev) |
| `npm run detect:faces -- --userId=<id> --allClean --mode=queue` | Backfill clean photos |
| `npm run detect:faces -- --userId=<id> --allClean --include-videos --mode=queue` | Backfill clean videos too |
| `npm run analyze:videos` | Backfill scene + faces for clean videos (skips seed/demo + missing R2) |
| `npm run analyze:videos -- --drain 20` | Enqueue then drain scene/faces workers |
| `npm run regroup:faces -- --userId=<id>` | Rebuild people via Rekognition identity matching |
| `POST /api/dev/faces` | Dev HTTP helper (`ALLOW_DEV_FACES` outside development) |

Keep `ALLOW_DEV_FACES` off in production unless you intentionally need ops access with `WORKER_SECRET`.

---

## Principles

1. **Clean-only** — No face scan before moderation clears the photo.
2. **Owner-scoped** — People and faces never cross user boundaries.
3. **Non-blocking** — Face enqueue failures must not fail moderation.
4. **Minimize retention** — Remove faces when media is no longer family-safe.
5. **Honest UX** — Tell families face recognition stays inside their account.

---

## Implementation map

| Area | Location |
| --- | --- |
| Detection | `src/lib/faces/detection.ts` |
| Grouping | `src/lib/faces/grouping.ts` (embedding fallback) |
| Identity matching | `src/lib/faces/rekognition-identity.ts`, `identity-grouping.ts` |
| Pipeline / enqueue | `src/lib/faces/pipeline.ts` |
| People domain | `src/lib/people/` |
| Worker | `src/workers/faces.ts` |
| UI | `src/app/(app)/people/`, `src/components/people/` |

---

## Status

| Capability | Status |
| --- | --- |
| Detect on clean photos | Done |
| Group into people | Done (Rekognition identity + embedding fallback) |
| People list + detail UI | Done |
| Auto-enqueue after clean | Done |
| Manual / backfill tools | Done |
| Live Rekognition / Vision | Opt-in via env |
| Advanced clustering | Future |
