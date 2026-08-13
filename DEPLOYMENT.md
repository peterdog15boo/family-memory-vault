# Deployment

Production checklist and platform notes for Family Memory Vault.

## Before first production deploy

### Secrets & config

- [ ] Copy `.env.example` → host env vars (Vercel / Cloudflare / Docker — never commit `.env.local`)
- [ ] `NEXT_PUBLIC_APP_URL=https://your-domain.com` (https required; boot check enforces this)
- [ ] Clerk **live** keys (`pk_live_` / `sk_live_`); production domain added in Clerk Dashboard
- [ ] `DATABASE_URL` (pooled) + run migrations with `DATABASE_URL_UNPOOLED`
- [ ] R2 credentials + **private** bucket; CORS allows `https://your-domain.com` for `PUT`/`GET`/`HEAD`
- [ ] `WORKER_SECRET` set to a long random value (required in production)
- [ ] `AI_MODERATION_ENABLED=true` + provider credentials (Rekognition / Vision / Hive)
- [ ] `PHOTODNA_ENABLED=true` + API key (after Microsoft approval)
- [ ] Leave `NCMEC_REPORTING_ENABLED=false` until counsel + ESP approval; then wire live CyberTipline creds
- [ ] Remove / unset: `MODERATION_FORCE_STATUS`, `ALLOW_MODERATION_FORCE`, `ALLOW_DEV_*`, `ALLOW_INSECURE_TLS`, `NODE_TLS_REJECT_UNAUTHORIZED=0`
- [ ] If using Stripe: **live** secret key + Dashboard **webhook** signing secret (`whsec_…`) + price IDs
- [ ] Stripe webhook endpoint: `https://your-domain.com/api/stripe/webhook` (events: subscription + checkout)
- [ ] Optional: `RESEND_API_KEY` + verified `EMAIL_FROM` (`Family Memory Vault <support@mail.familymemoryvault.ai>`); optional `EMAIL_REPLY_TO`
- [ ] Optional (beta): `NEXT_PUBLIC_BETA_SURVEY_URL` for Feedback header + Dashboard survey banner
- [ ] Promote at least one admin: `npm run admin:promote -- --email=…` (or `ADMIN_USER_IDS`)

### Database

```bash
npm run db:migrate
# optional demo only — skip on real production data
# npm run db:seed
```

### Workers

Uploads stay `pending_moderation` until workers run. In production you need **one** of:

1. Long-running processes: `npm run worker:moderation`, `worker:faces`, `worker:scene`, `worker:movies`
2. Authenticated cron hitting:
   - `POST /api/jobs/moderation`
   - `POST /api/jobs/faces`
   - `POST /api/jobs/scene`
   - `POST /api/jobs/movies`  
   Header: `Authorization: Bearer $WORKER_SECRET`

Movie encoding needs `ffmpeg` available to the movies worker (`ffmpeg-static` or `FFMPEG_PATH`).

Digital Legacy video posters also use ffmpeg on the **web app** host when completing an upload (best-effort; large sources skip thumbnails). Ensure ffmpeg is available to the Next.js process in production if you want posters.

### R2 prefixes (private vault)

| Prefix | Purpose |
|--------|---------|
| `temp/` | Gallery uploads only |
| `private-documents/` | Owner private files |
| `private-documents-temp/` | Document upload staging |
| `private-legacy-videos/` | Digital Legacy permanent videos + posters |
| `private-legacy-videos-temp/` | Legacy video upload staging |

**Required ops:** configure an R2 lifecycle rule to expire objects under `private-legacy-videos-temp/` (and ideally `private-documents-temp/`) after 1–7 days so abandoned uploads do not linger.

Gallery download helpers refuse all `private-*` prefixes. Details: [docs/DIGITAL_LEGACY_VIDEOS.md](./docs/DIGITAL_LEGACY_VIDEOS.md).

### Build & start

```bash
npm ci
npm run build
npm start
```

Boot runs `assertProductionEnv()` via `src/instrumentation.ts` and **throws** if required production vars are missing or unsafe.

### Smoke test after deploy

- [ ] `GET https://your-domain.com/api/health` → `200` / `"status":"ok"`
- [ ] Sign up / sign in (Clerk)
- [ ] Upload a photo → appears pending → worker marks clean/ready
- [ ] Digital Legacy: record or upload a short section video → play via modal (signed URL)
- [ ] Admin Safety / Ops pages load for an admin user
- [ ] If Stripe: test checkout in live mode carefully; confirm webhook `billing.webhook` logs
- [ ] Uptime monitor on `/api/health` (see [MONITORING.md](./MONITORING.md))

## Platform notes

### Vercel (web) + separate worker host

- Deploy the Next.js app on Vercel; set all env vars in the project.
- Run workers on a VM, Fly.io, Railway, or similar (ffmpeg + long polls).
- Or schedule Vercel Cron → `/api/jobs/*` with the bearer secret (watch function timeouts for movies).

### Clerk cookies

Clerk issues **Secure**, **HttpOnly** session cookies on HTTPS. Do not terminate TLS incorrectly or cookies will not stick. Keep `NEXT_PUBLIC_APP_URL` aligned with the canonical host.

### CORS

- **App APIs** are same-origin (Clerk session). Upload routes also reject mismatched `Origin`/`Referer` vs `NEXT_PUBLIC_APP_URL`.
- **Stripe webhooks** and **job drains** are server-to-server (signature / `WORKER_SECRET`) — no browser CORS.
- **R2** needs bucket CORS for direct browser `PUT` to the presigned URL.

### Security headers

`next.config.ts` sets `X-Frame-Options`, `nosniff`, Referrer-Policy, Permissions-Policy, HSTS, and disables `X-Powered-By`.

### Rollback

Keep the previous deployment + DB migration forward-only. Do not enable NCMEC live reporting as part of an untested rollback path.

## Known limitations (post-launch)

- **Workers are not bundled with the web deploy** — without moderation/faces/movies workers (or cron drains), uploads stay pending and movies never finish.
- **PhotoDNA / AI / NCMEC** are env-gated — mock moderation is fine for demos; production family safety needs live vendors + counsel-approved CyberTipline before `NCMEC_REPORTING_ENABLED=true`. Live NCMEC HTTP client still needs ESP credentials and final schema review.
- **R2 quarantine move can fail** while the DB row is still marked `csam_quarantined` (family surfaces stay blocked). Ops should alert on `moderation.quarantine_failed` / `storageMoveFailed`.
- **Face detection** is optional — People stays empty until `FACE_DETECTION_ENABLED` + faces worker.
- **Family sharing on Free** is intentionally gated — upgrade required to create/invite.
- **Memories shared with family** require an explicit share toggle; co-member *media* is visible automatically when clean/ready.
- **Presigned URLs** remain valid until TTL if content is later quarantined (short TTLs mitigate).
- **Movie encoding** needs ffmpeg on the worker host; large albums may exceed serverless timeouts — prefer a long-running movies worker.
- **Ask AI** only uses the signed-in user’s clean/ready media (not family co-member gallery files) when creating memories/movies — see [ASSISTANT.md](./ASSISTANT.md).
- **AI movie soundtracks** need `ELEVENLABS_API_KEY` (or another registered legitimate provider). See [docs/AI_SOUNDTRACK.md](./docs/AI_SOUNDTRACK.md). Unofficial Suno APIs are not supported.
- **Stripe** Free path works without keys; paid upgrades need live prices + webhook signing secret from the Dashboard (not the Stripe CLI secret).

## Recommended next steps after launch

1. Run workers (or secure cron) in production and alert on queue backlog / `*.job_failed`.
2. Enable PhotoDNA + AI moderation; keep NCMEC off until legal sign-off, then finish live CyberTipline integration tests.
3. Wire Stripe live prices, webhook, and a test checkout; confirm quota gates update.
4. Configure Resend + SPF/DKIM for invites and lifecycle email.
5. Add uptime on `/api/health` and dashboards from [MONITORING.md](./MONITORING.md).
6. Expand E2E coverage (Playwright) for upload → library and invite → accept.
7. Plan evidence retention / quarantine ops runbooks for safety incidents.

## Related docs

- [README.md](./README.md) — setup overview
- [ASSISTANT.md](./ASSISTANT.md) — Ask AI flow + safety
- [SAFETY.md](./SAFETY.md) — moderation / NCMEC
- [MONITORING.md](./MONITORING.md) — health + alerts
- [BILLING.md](./BILLING.md) — Stripe plans
- [docs/AI_SOUNDTRACK.md](./docs/AI_SOUNDTRACK.md) — AI movie soundtracks (ElevenLabs / future Suno partner)
- [docs/DIGITAL_LEGACY_VIDEOS.md](./docs/DIGITAL_LEGACY_VIDEOS.md) — legacy video privacy + recording
- [docs/PRIVATE_VAULT_SECURITY.md](./docs/PRIVATE_VAULT_SECURITY.md) — private vault contract
