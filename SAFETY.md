# Safety & Moderation

Family Memory Vault is a **family product with zero tolerance for CSAM** (child sexual abuse material). Child safety is a product requirement, not an optional feature.

**Policy in one sentence:** All uploaded media goes through automated safety checks (CSAM hash matching + AI moderation) before becoming visible. Only media with `moderation_status = clean` (and lifecycle `status = ready`) is ever shown to normal users. Suspected CSAM is quarantined, preserved as evidence, and reported according to legal requirements — never served, never auto-deleted.

This document is **not legal advice**. Consult qualified counsel before enabling live NCMEC reporting.

---

## End-to-end flow

```
Browser upload
  → POST /api/upload-url          (presigned PUT → R2 temp/…)
  → PUT object to R2
  → POST /api/media/complete
       • media.status            = pending_moderation
       • media.moderation_status = pending
       • enqueue processing_job type = moderation  (required; retried)
       • audit: moderation_events
  → Worker (npm run worker:moderation  OR  POST /api/jobs/moderation)
       1. Claim job
       2. PhotoDNA + AI scanners  (in parallel; live when keys/flags set)
       3. decideModerationStatus  (thresholds below)
       4. Persist:
            clean              → moderation_status=clean, status=ready
            adult              → moderation_status=adult; not on family surfaces
            rejected           → rejected
            needs_human_review → held; appears in /admin/review
            csam_quarantined   → R2 quarantine/ + NCMEC reporter
       5. Complete job
```

### Family surfaces (clean only)

| Gate | Rule |
| --- | --- |
| Gallery query | `getSafeMediaLibrary` / `getAccessibleMediaFilter` require `moderation_status = clean` **and** `status = ready` |
| Shared family media | Co-members only see each other’s **clean/ready** media — never pending, review, adult, rejected, or quarantined |
| **Memories** | Private by default; when shared, linked media still must be clean/ready |
| **Movies** | Source frames are clean/ready only; outputs use short-lived `movies/` signed URLs (see [MOVIES.md](./MOVIES.md)) |
| **People / faces** | Owner-scoped only; not shared via family (see [FACES.md](./FACES.md)) |
| Signed URLs | `getDownloadUrl()` refuses anything except `moderationStatus: "clean"`; movie play uses `getMovieDownloadUrl()` (prefix + short TTL) |
| Quarantine keys | Objects under `quarantine/` are never signed for normal downloads |
| User messaging | Banner copy stays generic — never reveals CSAM / quarantine specifics |

Affected routes: Dashboard, Media (`/media`), Memories (`/memories`, `/memories/[id]`), Movies (`/movies`), People (`/people`), Family (`/family`). Full sharing rules: [FAMILY_SHARING.md](./FAMILY_SHARING.md).

Face detection and the People UI also require this dual gate — see [FACES.md](./FACES.md).

### Movies safety contract

1. **Source media** — `createMovieJob` and `generateMovie` only accept memories with clean/ready items owned by the requester (`cleanReadyMediaFilter` + `isSafeToServe`).
2. **Outputs** — MP4/thumbnails live under `movies/{userId}/{movieId}/` and are signed only via `getMovieDownloadUrl` (5-minute default TTL).
3. **Quotas** — per-user daily create limit and concurrent render limit (see [MOVIES.md](./MOVIES.md)).
4. **Family** — movies are owner-private in v1 (not exposed on family surfaces).

Implementation: `src/lib/movies/**`, `src/workers/movies.ts`, `src/app/api/movies/**`.

### Memories safety contract

Memories are family collections built **only** from approved content:

1. **Writes** (`createMemory`, `addMediaToMemory`, `setMemoryCover`) load candidates through `cleanReadyMediaFilter(userId)` — pending, `needs_human_review`, adult, rejected, and `csam_quarantined` media are never inserted into `memory_media`.
2. **Reads** (`getMemoryWithMedia`, `listMemoryLibrary`, slideshow) always join with the same clean/ready gate. Non-owners may load a memory only when `sharedWithFamily` is true (and they share an active family with the owner).
3. **APIs** under `/api/memories*` require Clerk auth; unauthorized viewers receive `404 Memory not found` (no existence leakage).
4. Unclean rows that somehow remain linked (legacy data) stay invisible on family surfaces until removed or re-cleared.

Implementation: `src/lib/memories.ts`, `src/lib/permissions.ts`, `src/app/api/memories/**`. See also [FAMILY_SHARING.md](./FAMILY_SHARING.md).

---

## Current providers

| Layer | Implementation | When live |
| --- | --- | --- |
| **PhotoDNA** (known CSAM hashes) | `src/lib/moderation/providers/photodna.ts` | `PHOTODNA_ENABLED=true` + `PHOTODNA_API_KEY` (+ URL) |
| **AI moderation** (nudity / violence / vendor CSAM signals) | `src/lib/moderation/providers/ai-moderation.ts` | `AI_MODERATION_ENABLED=true` + provider credentials |
| **NCMEC CyberTipline** | `src/lib/moderation/ncmec.ts` | `NCMEC_REPORTING_ENABLED=true` + ESP credentials |
| **Mocks** | Same modules | Default when live flags are off — honors `MODERATION_MOCK_SCENARIO` |

### AI provider switch (`AI_MODERATION_PROVIDER`)

| Value | Provider |
| --- | --- |
| `rekognition` (default) | AWS Rekognition `DetectModerationLabels` |
| `google_vision` | Google Cloud Vision SafeSearch |
| `hive` | Hive Moderation API |
| `mock` | Local deterministic scores |

**PhotoDNA is the primary known-CSAM hash check.** General vision APIs do not replace it. Many AI vendors return weak or zero underage/CSAM signals — treat PhotoDNA matches and high AI CSAM scores as authoritative for quarantine.

Apply for PhotoDNA (free for qualified orgs): [microsoft.com/en-us/photodna](https://www.microsoft.com/en-us/photodna).

---

## Decision thresholds

Implemented in `decideModerationStatus` / `getModerationDecisionThresholds()` (`src/lib/moderation/service.ts`). Scores are in **[0, 1]**. Defaults are conservative: when ambiguous, prefer human review or quarantine over auto-clean.

| Signal | Condition | Outcome | Env override |
| --- | --- | --- | --- |
| PhotoDNA match | `match === true` | `csam_quarantined` | (vendor) |
| AI CSAM | ≥ **0.85** | `csam_quarantined` | `MODERATION_AI_CSAM_QUARANTINE_THRESHOLD` |
| AI CSAM | ≥ **0.55** and &lt; quarantine | `needs_human_review` | `MODERATION_AI_CSAM_REVIEW_THRESHOLD` |
| AI violence | ≥ **0.90** | `rejected` | `MODERATION_AI_VIOLENCE_REJECT_THRESHOLD` |
| AI violence | ≥ **0.55** and &lt; reject | `needs_human_review` | `MODERATION_AI_VIOLENCE_REVIEW_THRESHOLD` |
| AI nudity | ≥ **0.95** | `rejected` | `MODERATION_AI_NUDITY_REJECT_THRESHOLD` |
| AI nudity | ≥ **0.70** and &lt; reject | `adult` or `rejected` | `MODERATION_AI_NUDITY_ADULT_THRESHOLD` + `MODERATION_ADULT_POLICY` |
| AI nudity | ≥ **0.40** and &lt; adult | `needs_human_review` | `MODERATION_AI_NUDITY_REVIEW_THRESHOLD` |
| Otherwise | all below review bands | `clean` | — |

`MODERATION_ADULT_POLICY`:

- `adult` (default) — clear adult/non-CSAM nudity gets `moderation_status=adult` (never shown on family surfaces)
- `rejected` — same band becomes `rejected`

Priority order is PhotoDNA → AI CSAM → violence → nudity → clean. Misconfigured env bands are clamped so review ≤ action thresholds.

---

## Human review

Borderline automated scores become `needs_human_review` (lifecycle stays `pending_moderation`). `/admin/review` also lists auto-`adult` and auto-`rejected` (non-CSAM) so a human can approve family-photo false positives. CSAM quarantine stays off this queue.

- **Do not** appear in Dashboard / Memories until marked clean
- **Do** appear in `/admin/review` (and are summarized on `/admin/safety`)
- Are gated by `ADMIN_USER_IDS` (comma-separated Clerk user ids)

Rekognition **swimwear / underwear / non-explicit nudity / partially exposed breast (bikini) / suggestive / barechested** labels do **not** count toward the auto-adult nudity score. `"non-explicit nudity"` must not match the `"explicit nudity"` hint. Only graphic/explicit sexual labels can auto-adult or auto-reject.

If PhotoDNA / AI / R2 **throws** (timeout, credentials, decode), the worker retries the job. After max attempts it sets `needs_human_review` with label `processing_failed` — **not** `rejected`. Scanner failure is not a policy decision. Reviewers can approve as clean; Ops Retry re-scans. Never fail-open to `clean`. Never quarantine on processing failure alone.

### Reviewer actions (`applyHumanReviewDecision`)

| Action | Effect |
| --- | --- |
| Mark clean | `moderation_status=clean`, `status=ready` — eligible for library |
| Mark adult | Restricted; not on family surfaces |
| Reject | Rejected lifecycle |
| Quarantine (CSAM) | Full quarantine path + NCMEC reporter |

### Operator guidance

1. Only authorized admins in `ADMIN_USER_IDS` should open the review queue.
2. Prefer quarantine when CSAM cannot be ruled out — never “guess clean.”
3. Do not paste suspected CSAM into tickets, Slack, or logs; use opaque media ids.
4. Blurred / click-to-reveal previews are for reviewers only — never for family UI.
5. After a clean decision, confirm the item appears in the library only if both gates pass.

---

## NCMEC reporting responsibility

Operators of this service may have a legal duty to report apparent CSAM to [NCMEC CyberTipline](https://report.cybertip.org).

### What the product does

On `csam_quarantined`:

1. Move the object under R2 `quarantine/` (evidence preserved — **never auto-deleted**)
2. Set `moderation_status` / `status` to `csam_quarantined`, set `quarantined_at`
3. Call `reportCsamIncident` / `reportCsamIncidentForMedia` (`src/lib/moderation/ncmec.ts`): create → upload evidence → finish
4. Store `ncmec_report_id` / `ncmec_reported_at` when the reporter returns an id
5. Write `moderation_events` audit rows

### Operator obligations

- Obtain ESP credentials (`NCMEC_CYBERTIPLINE_*`) and use the correct API base (`…/ispws`; test vs production)
- Keep **`NCMEC_REPORTING_ENABLED=false`** until counsel and process review are complete (mock/no-op path otherwise)
- Submit required reports for qualifying incidents when enabled
- Restrict quarantine access to authorized safety personnel
- Do not redistribute illegal content

Production CyberTipline XML/schema compliance still requires tenant-specific validation with NCMEC — treat the module as the integration seam and verify against current ESP docs before go-live.

---

## Development: forcing moderation outcomes

**Never use real CSAM to test.** Use mocks / force flags only.

### Option A — Mock scanners (recommended locally)

Leave live providers off (`PHOTODNA_ENABLED` / `AI_MODERATION_ENABLED` not `true`, or incomplete keys). Set:

```bash
MODERATION_MOCK_SCENARIO=clean          # → clean
MODERATION_MOCK_SCENARIO=adult          # → adult
MODERATION_MOCK_SCENARIO=csam           # → PhotoDNA mock match → csam_quarantined + NCMEC path
MODERATION_MOCK_SCENARIO=rejected       # → rejected (extreme nudity)
MODERATION_MOCK_SCENARIO=review         # → needs_human_review (borderline nudity)
MODERATION_MOCK_SCENARIO=violence       # → rejected
MODERATION_MOCK_SCENARIO=violence_review # → needs_human_review
```

Aliases: `needs_human_review` / `human_review` → `review`.

Restart the Next.js app and moderation worker after changing env, then upload or re-run:

```bash
npm run moderate:media -- --mediaId=<id>
# or POST /api/dev/moderate  { "mediaId": "…" }
```

### Option B — Force final status (works even if vendor keys are present)

Skips scanners and applies a terminal status (CSAM still runs quarantine + NCMEC):

```bash
MODERATION_FORCE_STATUS=clean
MODERATION_FORCE_STATUS=adult
MODERATION_FORCE_STATUS=rejected
MODERATION_FORCE_STATUS=needs_human_review   # or review
MODERATION_FORCE_STATUS=csam_quarantined
```

Blocked in `NODE_ENV=production` unless `ALLOW_MODERATION_FORCE=true`.

Unset `MODERATION_FORCE_STATUS` when finished testing.

### Ops triggers

| Action | Command / endpoint |
| --- | --- |
| Poll worker | `npm run worker:moderation` |
| Drain queue via HTTP | `POST /api/jobs/moderation` (Bearer `WORKER_SECRET`) |
| Moderate one item | `npm run moderate:media -- --mediaId=<id>` |
| Dev HTTP trigger | `POST /api/dev/moderate` with `{ "mediaId": "…" }` |
| Human review UI | `/admin/review` (requires `ADMIN_USER_IDS`) |
| Safety overview | `/admin/safety` |

---

## Principles

1. **Zero tolerance for CSAM** — quarantine + report; never serve; never auto-delete evidence.
2. **Only clean media for normal users** — dual gate: `moderation_status = clean` and `status = ready`.
3. **Uploads start untrusted** — `pending_moderation` / `pending`; never `ready` on upload complete.
4. **No long-lived public media URLs** — short-lived presigned GETs only.
5. **Minimize exposure** — opaque ids in logs/UI; restricted admin access to quarantine and review.

---

## Environment flags (summary)

See `.env.example` for full lists. Never commit secrets or ship PhotoDNA / NCMEC / AI keys to the browser.

| Area | Key vars |
| --- | --- |
| PhotoDNA | `PHOTODNA_ENABLED`, `PHOTODNA_API_KEY`, `PHOTODNA_API_URL` |
| AI | `AI_MODERATION_ENABLED`, `AI_MODERATION_PROVIDER`, provider keys |
| Thresholds | `MODERATION_AI_*_THRESHOLD`, `MODERATION_ADULT_POLICY` |
| NCMEC | `NCMEC_REPORTING_ENABLED`, `NCMEC_CYBERTIPLINE_*` |
| Admin | `ADMIN_USER_IDS` |
| Queue | `WORKER_SECRET`, `QUEUE_*` |
| Dev | `MODERATION_MOCK_SCENARIO`, `MODERATION_FORCE_STATUS` |

---

## Implementation status

| Capability | Status |
| --- | --- |
| Auth-gated upload + `temp/` keys | Done |
| Reliable `moderation` job on complete | Done |
| Family gallery: clean + ready only | Done |
| PhotoDNA + AI parallel pipeline | Done (live when enabled) |
| Decision thresholds + human-review band | Done |
| Quarantine module + NCMEC reporter seam | Done |
| Admin review + safety overview | Done |
| Dev mock / force outcomes | Done |
| Live CyberTipline schema sign-off | Ops / legal (credentials + counsel) |
| Cloudflare Queues (replace DB poll) | Planned |
| PhotoDNA video frame extraction | Planned |
| Async video AI moderation | Planned |

Until the moderation worker is running, uploads correctly remain invisible in the family library while pending review.

---

## Private Documents & Digital Legacy

Private paperwork and Digital Legacy live in a **separate owner-only vault** — not family sharing, not the photo gallery, not assistant search.

| Surface | Access model |
| --- | --- |
| **Private Documents** | Strict `userId` filter; family membership grants **nothing** |
| **Digital Legacy** | Owner-only by default; emergency grantees via break-glass rules only |
| **Signed file URLs** | 60s default download TTL (120s max); upload URLs 10 min |
| **Legacy videos** | `private-legacy-videos/` only — never galleries, Memories, People, or family shares; record/upload + short-lived playback — see [docs/DIGITAL_LEGACY_VIDEOS.md](./docs/DIGITAL_LEGACY_VIDEOS.md) |
| **Secure items** | Content redacted in lists/SSR until `/reveal` after step-up auth |
| **Audit** | `sensitive_access_events` logs downloads/reveals (no content in metadata) |
| **Thumbnails** | Image derivatives only — never document text or passwords |
| **Notifications / email** | Generic copy only — never vault bodies or secure fields |
| **Assistant** | Never queries `private_documents`, `legacy_*`, or `emergency_access_*` |

Full rules: [docs/PRIVATE_VAULT_SECURITY.md](./docs/PRIVATE_VAULT_SECURITY.md). Emergency access: [docs/EMERGENCY_ACCESS.md](./docs/EMERGENCY_ACCESS.md). Digital Legacy videos: [docs/DIGITAL_LEGACY_VIDEOS.md](./docs/DIGITAL_LEGACY_VIDEOS.md).

Code constants: `PRIVATE_DOCUMENTS_SAFETY`, `DIGITAL_LEGACY_SAFETY`, `EMERGENCY_ACCESS_SAFETY`, `PRIVATE_VAULT_SECURITY_RULES` in `src/lib/security/sensitive-access.ts`.
