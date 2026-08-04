# Production monitoring

What to watch for Family Memory Vault in production, and how the app emits signals.

## Health check

`GET /api/health` — public, no auth, `Cache-Control: no-store`.

| Status | HTTP | Meaning |
|--------|------|---------|
| `ok` | 200 | App process up; Postgres answered `select 1` |
| `degraded` | 503 | Database unreachable or query failed |

Point an uptime monitor (Better Stack, Pingdom, Cloudflare Health Checks, etc.) at this URL every 30–60s. Alert on consecutive non-200s.

This does **not** check R2, Stripe, Clerk, Resend, or workers. Those need separate signals below.

## Log format

Logs are **single-line JSON** on stdout/stderr:

```json
{"ts":"...","level":"info|warn|error|debug","event":"upload.completed","service":"family-memory-vault","env":"production",...}
```

Ship platform logs (Vercel / Cloudflare / Docker) to a drain that can filter on `event` and `level`. Sensitive field names and long strings are redacted in `src/lib/observability/logger.ts`. Set `LOG_LEVEL=debug` only when diagnosing (enables debug events such as successful health checks).

Stable event names live in `src/lib/observability/events.ts` (`LogEvents`).

## Request logging

Middleware logs `http.request` for `/api/*` (except `/api/health`) with `requestId`, `method`, and `path`. Responses include `x-request-id` for correlating client reports with logs.

Unhandled API errors go through the shared API error helper and emit structured `error` logs.

## Domain events to alert on

| Event | Level | Alert when |
|-------|-------|------------|
| `health.check` | error | 503 / DB down |
| `upload.failed` | error | Spike vs baseline |
| `moderation.decision` | info | Track rates; spike in `csam_quarantined` / `needs_human_review` |
| `moderation.quarantine_completed` | warn | Always review; page on unexpected volume |
| `moderation.quarantine_failed` | error | Page immediately |
| `moderation.ncmec_reported` | warn | Audit trail; verify volume matches quarantines |
| `moderation.ncmec_failed` | error | **Page** — quarantine may exist without a finished CyberTipline report |
| `moderation.job_failed` | error | Retries exhausted or worker errors |
| `movie.failed` / `movie.job_failed` | error | Sustained failures |
| `faces.job_failed` | error | Sustained failures |
| `billing.webhook_failed` | error | Checkout/subscription sync broken |
| `billing.webhook` | info | Audit (type + outcome) |

Also watch:

- `upload.url_issued` / `upload.completed` — funnel health
- `movie.queued` / `movie.ready` — pipeline lag (queued without ready)

## Background jobs

Workers (moderation, movies, faces) emit structured logs for drain activity and call `logJobFailure` on processing errors. Failed jobs remain visible in:

- **Admin → Ops** (`/admin/ops`) — queue stats, failed jobs, pipeline health
- Database `processing_jobs` with status `failed` / retry fields

**Monitor in production:**

1. Worker processes are running (process supervisor / cron hitting job drain routes if used).
2. Count of `failed` jobs not decreasing after retries.
3. Age of oldest `pending` / `processing` job (backlog / stuck claims).
4. Error-rate of `*.job_failed` events.

Stale job reclaim exists in the queue helpers — if reclaim volume spikes, workers may be crashing mid-job.

## Suggested dashboards

1. **Availability** — `/api/health` success rate + latency.
2. **Upload → moderation** — `upload.completed` vs `moderation.decision` by outcome.
3. **Safety** — quarantines, NCMEC success/fail, human-review backlog (admin Safety).
4. **Movies** — queued / ready / failed over time.
5. **Billing** — webhook success vs fail by Stripe event type.
6. **API errors** — 4xx/5xx from platform metrics + structured error logs.

## External dependencies

| Dependency | What to monitor |
|------------|-----------------|
| Neon Postgres | Connection errors, pool exhaustion, slow queries |
| Cloudflare R2 | 4xx/5xx on signed URL use; storage growth vs plan quotas |
| Clerk | Auth error rates, webhook delivery if used |
| Stripe | Webhook delivery in Stripe Dashboard; `billing.webhook_failed` |
| Resend (optional) | Bounce/complaint; app falls back to logging without key |
| NCMEC CyberTipline | Only when live reporting enabled — unfinished reports, API errors |

## On-call playbooks (short)

- **Health 503** — check Neon status / `DATABASE_URL`, recent deploys, connection limits.
- **NCMEC failed** — confirm media is quarantined in admin Safety; resume/report path; do not serve quarantined media.
- **Job backlog** — restart workers; check `/admin/ops`; look for poison payloads in failed job error text.
- **Billing webhook fails** — verify Stripe signing secret and endpoint URL; replay events from Stripe.

## Local verification

```bash
curl -s http://localhost:3000/api/health
# {"status":"ok","checks":{"database":"ok"},...}
```
