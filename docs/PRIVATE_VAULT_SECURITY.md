# Private Vault Security

Security contract for **Private Documents**, **Digital Legacy**, and **Emergency Access**. These surfaces are intentionally isolated from family photo sharing.

## Core principles

1. **Owner-only by default** — every query filters by the authenticated owner's `userId`.
2. **Separate from family sharing** — family membership, shared memories, and gallery permissions never grant document or legacy access.
3. **Short-lived signed URLs only** — no public or permanent download links for private files.
4. **Reveal, don't preload** — passwords and secure-item content are redacted until an explicit reveal step succeeds.
5. **Step-up before sensitivity** — document downloads and secure-item reveals require Clerk reverification or explicit in-app confirmation.
6. **Audit sensitive access** — downloads and reveals append to `sensitive_access_events` without storing content in metadata.
7. **No leakage in side channels** — thumbnails, notifications, and emails never include document bodies, legacy text, or passwords.
8. **No assistant indexing** — the AI assistant searches clean media only, never private vault tables.

## Signed URL lifetimes

| Purpose | TTL |
|--------|-----|
| Private document upload | 10 minutes |
| Private document download | **60 seconds** (default) |
| Private document download (max) | **120 seconds** |
| Legacy video upload | 10 minutes |
| Legacy video playback / thumbnail | **60 seconds** (default) |
| Legacy video playback (max) | **120 seconds** |
| Thumbnail preview (documents) | Same download route; image derivative only |

Gallery and movie signed URLs use separate helpers that **refuse** `private-documents/` and `private-legacy-videos/` keys.

Legacy videos are never listed in media galleries, Memories, People pages, or family shared views.

## Secure items workflow

```
List / page load  →  contentRedacted: true, content: null
User clicks Reveal  →  step-up auth (reverification or confirmed: true)
POST .../reveal  →  returns content, writes audit event
User clicks Hide  →  client clears local revealed state
```

Applies to:

- Owner: `POST /api/legacy/secure-items/[id]/reveal`
- Emergency grantee: `POST /api/legacy/granted/[ownerUserId]/secure-items/[id]/reveal`

## Document download workflow

```
User confirms download  →  POST /api/documents/[id]/download-url { purpose: "document", confirmed: true }
Server verifies step-up  →  issues 60s signed URL  →  audit log
```

Thumbnail previews do not require step-up but are still audit-logged and must remain image-only derivatives.

## Audit log (`sensitive_access_events`)

| Action | When |
|--------|------|
| `private_document.download_url` | Full file download URL issued |
| `private_document.thumbnail_url` | Thumbnail URL issued |
| `legacy.video.playback_url` | Legacy video playback URL issued (owner) |
| `legacy.video.thumbnail_url` | Legacy video poster URL issued (owner) |
| `legacy.granted.video.playback_url` | Grantee playback URL issued |
| `legacy.granted.video.thumbnail_url` | Grantee poster URL issued |
| `legacy.secure_item.reveal` | Owner reveals secure item |
| `legacy.granted.secure_item.reveal` | Grantee reveals secure item |
| `emergency_access.vault_view` | Grantee loads granted legacy vault |

Metadata must never include: `content`, `password`, `notes`, signed URLs, or message bodies.

Legacy video lists and emergency packets include **metadata only** (title, section, duration). Full video objects are signed only when the player or a visible poster requests them (`purpose: "playback"` | `"thumbnail"`). Packet exports never include video descriptions or signed URLs.

## Clerk reverification

Enable **Reverification** in the Clerk Dashboard for strongest protection. When active, `requireSensitiveStepUp()` accepts a fresh session factor via `auth().has({ reverification: 'strict' })`.

When reverification is unavailable, the API accepts `{ confirmed: true }` after an in-app confirmation dialog (still audit-logged as `explicit_confirm`).

## Emergency access boundary

Emergency grantees may read granted legacy text through `/api/legacy/granted/[ownerUserId]` but:

- Secure items remain masked until grantee reveal
- Legacy videos play via short-lived granted playback URLs (`POST .../videos/[id]/playback`); lists never include signed video URLs
- Private document **files** are not downloadable via emergency grant (linked titles may appear as references only)
- Emergency access notifications contain generic copy only
- Emergency packet exports list video **titles** only — never signed URLs

## Assistant & search

Excluded domains (never queried):

- `private_documents`, `document_categories`
- `legacy_profile`, `legacy_contacts`, `legacy_instructions`, `legacy_secure_items`, `legacy_videos`
- `emergency_access_designations`, `sensitive_access_events`

See `ASSISTANT_EXCLUDED_DATA_DOMAINS` in `src/lib/ai/safety.ts`.

## Migrations

- `0020_private_documents.sql`
- `0022_digital_legacy.sql`
- `0023_emergency_access.sql`
- `0024_sensitive_access_audit.sql`
- `0028_legacy_videos.sql`
- `0029_legacy_videos_is_primary.sql`

Apply: `npx tsx scripts/apply-0028-legacy-videos.ts` then `npx tsx scripts/apply-0029-legacy-videos-is-primary.ts`

## Implementation map

| Concern | Primary module |
|---------|----------------|
| Step-up + audit | `src/lib/security/sensitive-access.ts` |
| Document storage TTL | `src/lib/documents/storage.ts` |
| Legacy video storage | `src/lib/legacy/video-storage.ts` |
| Legacy video playback URLs | `src/lib/legacy/video-playback.ts` |
| Secure item serialization | `src/lib/legacy/serialize.ts` |
| Owner reveal API | `src/app/api/legacy/secure-items/[id]/reveal/route.ts` |
| Grantee reveal API | `src/app/api/legacy/granted/[ownerUserId]/secure-items/[id]/reveal/route.ts` |
| Owner video playback | `src/app/api/legacy/videos/[id]/playback/route.ts` |
| Grantee video playback | `src/app/api/legacy/granted/[ownerUserId]/videos/[id]/playback/route.ts` |
| Document download | `src/app/api/documents/[id]/download-url/route.ts` |
