# Family Memory Vault

A private, family-safe place to preserve photos, videos, and memories — with privacy and child safety as first-class requirements.

**All uploaded media goes through automated safety checks (CSAM hash matching + AI moderation) before becoming visible. Suspected CSAM is quarantined and reported according to legal requirements.**

## Tech stack

| Layer | Choice |
| --- | --- |
| App | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS |
| Auth | Clerk |
| Database | Neon PostgreSQL + Drizzle ORM |
| Object storage | Cloudflare R2 (private bucket, presigned URLs only) |
| Jobs | Database-backed `processing_jobs` queue + Node workers |
| Billing (optional) | Stripe |
| Email (optional) | Resend |
| Moderation | PhotoDNA + AI (Rekognition / Google Vision / Hive) + NCMEC CyberTipline hooks |

## Key features

- **Private library** — galleries only show `moderation_status = clean` and `status = ready`
- **Upload pipeline** — browser → short-lived R2 PUT → `/api/media/complete` → `pending_moderation` → worker
- **Safety / moderation** — PhotoDNA, AI scores, human review, quarantine; never serve quarantine keys via signed URLs ([SAFETY.md](./SAFETY.md))
- **Memories** — albums from approved media; private by default; optional family share
- **People** — face detection/grouping on clean photos you own ([FACES.md](./FACES.md))
- **Family sharing** — invites, roles, household privacy model ([FAMILY_SHARING.md](./FAMILY_SHARING.md))
- **Movies** — themed films from clean memory photos ([MOVIES.md](./MOVIES.md))
- **Ask AI** — natural-language search and memory/movie creation with strict clean-media + ownership rules ([ASSISTANT.md](./ASSISTANT.md))
- **Languages** — English (US) default; Spanish, French, German, and more, with safe English fallbacks ([docs/README.md](./docs/README.md#languages-i18n))
- **Private Documents** — owner-only document vault with categories, reminder dates, secure download links, and business / estate paperwork workflows
- **Digital Legacy** — message, contacts, practical instructions, business continuity notes, secure items, emergency access, and readiness progress
- **Plans & quotas** — storage and feature gates; optional Stripe checkout ([BILLING.md](./BILLING.md))
- **Admin** — safety review, ops/queue health ([ADMIN.md](./ADMIN.md))
- **Observability** — structured JSON logs + `/api/health` ([MONITORING.md](./MONITORING.md))

## Local setup

### 1. Install

```bash
npm install
```

### 2. Environment

```bash
cp .env.example .env.local
```

Fill in at least the **required** keys (see below). Full comments live in [`.env.example`](./.env.example).

### 3. Database

```bash
npm run db:migrate
npm run db:seed   # optional demo data
```

### 4. R2 CORS (local uploads)

On the R2 bucket, allow origin `http://localhost:3000`, methods `PUT`/`GET`/`HEAD`, and content headers used by the browser upload.

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Run workers (needed for uploads to become visible)

```bash
npm run worker:moderation
npm run worker:faces      # if FACE_DETECTION_ENABLED=true
npm run worker:movies     # for movie generation
npm run worker:plaid      # if Plaid Connected Accounts is configured
```

Or drain once with `Authorization: Bearer $WORKER_SECRET`:

- `POST /api/jobs/moderation`
- `POST /api/jobs/faces`
- `POST /api/jobs/movies`
- `POST /api/jobs/plaid`

## Environment variables

| Area | Variables | Notes |
| --- | --- | --- |
| **App** | `NEXT_PUBLIC_APP_URL` | Required. `https://…` in production |
| **Clerk** | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Required |
| **Neon** | `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Pooled for app; unpooled for migrations |
| **R2** | `R2_ACCOUNT_ID` / `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_REGION` | Required for uploads |
| **Workers** | `WORKER_SECRET`, `QUEUE_*` | `WORKER_SECRET` required in production |
| **Plaid** | `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, `PLAID_PRODUCTS`, `PLAID_TOKEN_ENCRYPTION_KEY` | Optional; enables Connected Accounts |
| **Moderation** | `AI_MODERATION_*`, provider keys, `PHOTODNA_*`, `NCMEC_*`, `MODERATION_MOCK_SCENARIO` | Enable live vendors for production |
| **Faces** | `FACE_DETECTION_*`, `FACE_GROUPING_*` | Optional |
| **Stripe** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_*` | Optional; webhook secret required if Stripe is enabled |
| **Email** | `RESEND_API_KEY`, `EMAIL_FROM`, optional `EMAIL_REPLY_TO` | Optional |
| **Admin** | `ADMIN_USER_IDS` | Optional bootstrap; prefer `npm run admin:promote` |

Production boot validates required vars via `src/instrumentation.ts` (see [DEPLOYMENT.md](./DEPLOYMENT.md)).

## Running the app

| Command | Description |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build + serve |
| `npm test` | Vitest suite ([TESTING.md](./TESTING.md)) |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Apply Drizzle migrations |
| `npm run db:seed` | Seed safe demo rows |
| `npm run worker:moderation` | Moderation poll loop |
| `npm run worker:faces` | Face detection poll loop |
| `npm run worker:movies` | Movie render poll loop |
| `npm run admin:promote` | Grant admin (`--email=…`) |

## Safety & moderation

1. Upload lands in `temp/` then `originals/` — **never** `ready`/`clean` at complete time  
2. Worker runs PhotoDNA + AI (or mock scenario when vendors are off)  
3. Outcomes: clean → ready (and optional face job); adult / rejected / needs_human_review; CSAM → quarantine + NCMEC path  
4. Family UIs and signed URLs refuse non-clean / quarantine content  

Details, thresholds, and test overrides: [SAFETY.md](./SAFETY.md).  
**Do not** set force-moderation flags in production — they are rejected at boot.

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the production checklist, known limitations, and post-launch next steps.

Monitoring & alerts: [MONITORING.md](./MONITORING.md).

## Private Documents & Digital Legacy

The app includes a separate owner-only private vault for documents and legacy planning. These surfaces are intentionally isolated from family media sharing, Memories, Movies, and general assistant search.

### Private Documents

- Upload PDFs, images, and common Office files into private categories
- Add tags, notes, document dates, and typed reminder dates for renewals, contract end dates, expirations, and reviews (including overdue highlighting)
- Browse by category, important items, recent uploads, or reminders (upcoming + overdue)
- Use short-lived signed URLs only for previews and downloads

### Digital Legacy

- Write a message to loved ones (letter + optional featured video farewell packet)
- Keep key contacts such as attorneys, executors, accountants, insurance agents, or business partners
- Add practical instructions, including "where things are" checklists
- Build business succession notes with starter sections for day-one instructions, critical systems, and customer communication guidance
- Attach private documents directly to legacy instruction blocks when a paper trail will help
- Record or upload **section videos** (isolated R2 prefix; never the family media library)
- Order multiple videos per section; Business Continuity supports “Watch this first” walkthroughs
- Play privately via short-lived signed URLs only
- Track readiness with a progress score and checklist

### Emergency Access

- Trusted contacts are managed separately from family sharing
- Authorized trusted people can view a read-only emergency copy of the Digital Legacy vault
- They can export a markdown emergency packet once access is granted (video **titles** only)
- Secure item contents stay redacted until explicitly revealed in-app
- Grantees can play legacy videos through granted short-lived URLs

See also:

- [SAFETY.md](./SAFETY.md)
- [ASSISTANT.md](./ASSISTANT.md)
- [docs/EMERGENCY_ACCESS.md](./docs/EMERGENCY_ACCESS.md)
- [docs/PRIVATE_VAULT_SECURITY.md](./docs/PRIVATE_VAULT_SECURITY.md)
- [docs/DIGITAL_LEGACY_VIDEOS.md](./docs/DIGITAL_LEGACY_VIDEOS.md)
- [docs/APP_THEMES.md](./docs/APP_THEMES.md)
- [docs/README.md](./docs/README.md) — docs index + **how to add a language**

## Project structure

```
src/
  app/                 # App Router pages + API routes
  components/          # UI
  lib/
    db/                # Schema + client
    moderation/        # Safety pipeline
    faces/ movies/     # People + generated films
    observability/     # Structured logging
    security/          # Rate limits, worker auth, origin checks
    stripe/            # Billing
  workers/             # moderation / faces / movies
```

## Further reading

| Doc | Topic |
| --- | --- |
| [docs/README.md](./docs/README.md) | Docs index + adding a language |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Production checklist |
| [SAFETY.md](./SAFETY.md) | Moderation & NCMEC |
| [MONITORING.md](./MONITORING.md) | Health & log events |
| [TESTING.md](./TESTING.md) | Vitest |
| [BILLING.md](./BILLING.md) | Plans & Stripe |
| [FACES.md](./FACES.md) | People / faces |
| [FAMILY_SHARING.md](./FAMILY_SHARING.md) | Household sharing |
| [MOVIES.md](./MOVIES.md) | Movie generation |
| [EMAIL.md](./EMAIL.md) / [NOTIFICATIONS.md](./NOTIFICATIONS.md) | Email & in-app |

## License

Private / unpublished — all rights reserved.
