# Billing & plan limits

Family Memory Vault uses **user-scoped** subscriptions. The **Free** plan never requires Stripe. Paid upgrades use **Stripe Checkout**; payment methods and cancellation use the **Customer Portal**.

Account usage (plan, storage, movies this month, next billing date) lives on **`/billing`**. Settings shows a compact summary.

---

## Plans

| Plan | Price | Storage | Family seats | Movies / month | Concurrent movie jobs | Notes |
|------|-------|---------|--------------|----------------|----------------------|--------|
| **Free** | $0 | 5 GB | 1 (personal) | 5 | 1 | Face detection on; no family sharing; no cinematic themes; max **25** people |
| **Family** | $9.99/mo · $99.90/yr | 100 GB | 6 | 30 | 2 | Sharing + cinematic themes; max **100** people |
| **Family Plus** | $19.99/mo · $199.90/yr | 1 TB | 12 | 100 | 3 | + priority render; max **250** people |
| **Legacy** | — (no public checkout) | Unlimited | 20 | 200 | 5 | Grandfathered / ops-assigned only |

Canonical seed: `src/lib/plans/catalog.ts` → `plans` table (`npm run db:seed`).

### Soft / env ceilings (movies)

| Limit | Default | Env |
|-------|---------|-----|
| Movies per UTC day (burst) | 10 | `MOVIE_DAILY_LIMIT` |
| Concurrent `movie.render` jobs | `min(plan, env)` · env default 3 | `MOVIE_ACTIVE_JOB_LIMIT` |

---

## How limits are enforced

All enforcement is **server-side**. UI banners and disabled buttons are helpers only.

| Action | When checked | Where |
|--------|--------------|--------|
| **Upload (presign)** | Before issuing R2 URL | `POST /api/upload-url` → `assertUploadWithinStorageQuota` |
| **Upload (finalize)** | Before promote + DB insert | `POST /api/media/complete` — uses **R2 `ContentLength`**, not client-reported size; also enforces per-type max (25 MB images / 500 MB video) |
| **Create movie** | Before insert / enqueue / render | `createMovieJob` → monthly plan + daily burst + concurrent job + theme gates |
| **Create family / invite** | Before writes | `canCreateFamily` / `canInviteMember` |
| **Create person** | Before insert | `canCreatePerson` (and face grouping skips on `plan_limit`) |

Usage warnings appear at **≥80%** of storage or monthly movies (`USAGE_WARNING_PERCENT`). Hard limits show upgrade prompts on `/upload`, movie create, `/billing`, and the dashboard.

Storage used = sum of `media.byte_size` for the user (excluding CSAM quarantine). Billing is **per user**, not pooled across family members.

### Free users cannot buy Legacy or spoof a plan

- Checkout body allows only `family` | `family_plus`.
- Stripe **price IDs** come from server env — never from the client.
- Webhook sync maps **Stripe price ID → plan** (`resolvePlanFromPriceId`). Checkout metadata is not trusted for entitlements.
- Unknown price → Free. No client API writes `subscriptions.plan_id`.

---

## Stripe setup

```env
STRIPE_SECRET_KEY=sk_test_…
STRIPE_WEBHOOK_SECRET=whsec_…
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…   # optional for now
STRIPE_PRICE_FAMILY_MONTHLY=price_…
STRIPE_PRICE_FAMILY_YEARLY=price_…
STRIPE_PRICE_FAMILY_PLUS_MONTHLY=price_…
STRIPE_PRICE_FAMILY_PLUS_YEARLY=price_…
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Create matching Products/Prices in the [Stripe Dashboard](https://dashboard.stripe.com).

### Endpoints

| Route | Purpose |
|-------|---------|
| `POST /api/billing/checkout` | `{ planSlug, interval }` → Checkout URL |
| `POST /api/billing/portal` | Customer Portal URL (return → `/billing`) |
| `POST /api/stripe/webhook` | Subscription lifecycle → `subscriptions` |

### Webhook security & idempotency

1. **Signature** — raw body + `Stripe-Signature` verified with `STRIPE_WEBHOOK_SECRET` (`constructEvent`). No Clerk auth on this route.
2. **Idempotency** — each `event.id` is claimed in `stripe_webhook_events` before handling. Duplicates return `200` with `duplicate: true`. On handler failure the claim is **released** so Stripe can retry.
3. **Events** — `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`.
4. Sync failures that look fixable (e.g. missing user) return **500** so Stripe retries; bad signatures return **400**.

### Local webhooks

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Paste the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`.

Apply the webhook dedupe migration: `npm run db:migrate` (includes `0010_stripe_webhook_events`).

---

## How Free works

- `ensureFreeSubscription` creates an `active` row on plan `free` with `billing_interval = none`.
- No Stripe Customer until Checkout or Portal.
- On paid subscription deleted → downgrade to Free; keep `stripe_customer_id` for re-subscribe.
- Active statuses for paid limits: `active`, `trialing`, `past_due` (failed payment keeps entitlements until canceled — product choice).

---

## UI

| Surface | What |
|---------|------|
| `/pricing` | Public plans + Checkout |
| `/pricing/success` | Syncs Checkout session, shows plan |
| `/billing` | Plan, storage, movies, next billing date, upgrade |
| Dashboard / Settings | Plan badge + usage warnings |
| Upload / movie create | Blocked-state upgrade prompts |

Code map: `src/lib/plans`, `src/lib/billing`, `src/lib/stripe`, `src/components/billing`.
