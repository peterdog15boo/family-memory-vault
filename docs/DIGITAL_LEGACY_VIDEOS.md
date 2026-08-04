# Digital Legacy Videos

Owner-only video messages and operational walkthroughs for the Digital Legacy vault. These clips are intentionally isolated from the family media library, Memories, Movies, People pages, and shared galleries.

## What you can do

| Action | Where |
|--------|--------|
| Record from camera + microphone | Any Digital Legacy section that offers “Record” |
| Upload a pre-recorded file (MP4 / WebM / MOV) | Same sections via “Upload” |
| Multiple videos per section | Ordered list; reorder with up/down |
| Feature / “Watch this first” | Message to Loved Ones + Business Continuity |
| Secure playback | Modal player with short-lived signed URLs |
| Read-only for emergency grantees | Granted vault + `POST .../granted/.../playback` |

## Section organization

Videos are scoped by `section_type` on `legacy_videos`:

| Section | Typical use |
|---------|-------------|
| `message_to_loved_ones` | Farewell packet — featured personal message + extras |
| `business_operations` | Ordered walkthroughs (Start Here, Systems Access, People to Call…) |
| `survivors_guidance` | Customer / vendor / team communication clips |
| Practical sections (`personal`, `financial`, `accounts_access`, `legal`) | Optional spoken notes beside written instructions |
| `custom` | Reserved for future custom blocks |

Written notes and videos live side by side in each section. Business Continuity emphasizes **recommended watching order** and optional **written summaries** under each clip. Message to Loved Ones treats video as central to a combined farewell packet (letter + voice).

## In-browser recording

1. User taps **Record** (or a suggested title chip).
2. Browser requests camera + microphone (HTTPS required).
3. Soft guidance encourages short clips (~1–2 minutes; client soft-cap 2 minutes / ~80MB).
4. Preferred container is **MP4** when `MediaRecorder` supports it (better Safari/iOS playback); otherwise WebM.
5. File is uploaded to a **temp** R2 key via a short-lived PUT URL, then promoted to a permanent private key and saved as a `legacy_videos` row.
6. Poster frame is generated best-effort with ffmpeg when the source is small enough; large files skip thumbnails without failing the save.

### When camera / microphone is unavailable

The recorder surfaces clear states:

- **Blocked** — permission denied; how to re-enable + suggestion to upload instead
- **Unavailable** — no device / constraints failed; retry + upload fallback
- **Unsupported** — insecure context or no MediaRecorder; use Upload with MP4/MOV

Upload remains available whenever recording cannot run.

## Uploaded videos

1. User chooses a file from their device library (or files app).
2. App requests a signed PUT URL for `private-legacy-videos-temp/{userId}/…`.
3. Browser uploads directly to R2.
4. `POST /api/legacy/videos` promotes the object to `private-legacy-videos/{userId}/{videoId}/…`, creates the DB row, and attempts a poster.

Allowed types: `video/mp4`, `video/webm`, `video/quicktime`, `video/x-matroska`. Size limit matches gallery video max (`LEGACY_VIDEO_MAX_BYTES`). Bytes count toward the user’s storage quota together with gallery media and private documents.

## Privacy model

1. **Owner-only by default** — every list/get/update/delete/reorder filters by the authenticated owner’s `userId`.
2. **Isolated storage** — objects live only under `private-legacy-videos/` (and `private-legacy-videos-temp/` during upload). Gallery upload/download helpers **refuse** these prefixes.
3. **No family sharing path** — never joined into Memories, Movies, People, family albums, or assistant media search (`legacy_videos` is in `ASSISTANT_EXCLUDED_DATA_DOMAINS`).
4. **Signed URLs only** — upload PUT (~10 min) and playback/thumbnail GET (**60s** default, **120s** max). Lists never batch-sign video objects; posters and players request URLs on demand.
5. **Serialization** — API/SSR responses expose metadata (`title`, `description`, `hasThumbnail`, …) never raw storage keys or permanent links.
6. **Emergency access** — authorized grantees may play via granted playback routes; emergency packets list **titles only** (no descriptions, no URLs).
7. **Audit** — issuing playback or thumbnail URLs writes `sensitive_access_events` (`legacy.video.*` / `legacy.granted.video.*`).
8. **Delete cleanup** — removing a video deletes the DB row and best-effort deletes the permanent object + thumbnail. Abandoned temp uploads should be expired with an R2 lifecycle rule on `private-legacy-videos-temp/` (see [DEPLOYMENT.md](../DEPLOYMENT.md)).

Playback is session-authenticated (same vault session as other Digital Legacy pages). Document downloads and secure-item reveals use stronger step-up; video playback is intentionally vault-session gated and rate-limited.

## Security contract (pointers)

- Full private vault rules: [PRIVATE_VAULT_SECURITY.md](./PRIVATE_VAULT_SECURITY.md)
- Emergency access: [EMERGENCY_ACCESS.md](./EMERGENCY_ACCESS.md)
- Product safety overview: [SAFETY.md](../SAFETY.md)
- Code constants: `DIGITAL_LEGACY_SAFETY` in `src/lib/legacy/types.ts`

## API map (owner)

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/legacy/videos` | Metadata list (optional `?section=`) |
| POST | `/api/legacy/videos/upload-url` | Temp signed PUT |
| POST | `/api/legacy/videos` | Complete upload + create row |
| PATCH/DELETE/GET | `/api/legacy/videos/[id]` | Update / delete / metadata |
| POST | `/api/legacy/videos/reorder` | Recommended order within a section |
| POST | `/api/legacy/videos/[id]/playback` | Short-lived playback or thumbnail (`purpose`) |

## API map (emergency grantee)

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/legacy/granted/[ownerUserId]/videos/[id]/playback` | Read-only signed media |

## Migrations

- `drizzle/0028_legacy_videos.sql`
- `drizzle/0029_legacy_videos_is_primary.sql`

```bash
npx tsx scripts/apply-0028-legacy-videos.ts
npx tsx scripts/apply-0029-legacy-videos-is-primary.ts
```

## Acceptance checklist

- [x] Record from camera/microphone into a legacy section
- [x] Upload a pre-recorded video into a legacy section
- [x] Multiple videos per section with reorder
- [x] Secure short-lived playback
- [x] Private and separate from the normal media library
- [x] Graceful camera/microphone failure with upload fallback
- [x] Cleanup of stored objects on delete
