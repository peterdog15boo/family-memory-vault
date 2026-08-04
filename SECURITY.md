# Security notes

Hardening applied for Family Memory Vault API and media access.

## Authentication & authorization

- User APIs use `requireApiUser()` (`src/lib/auth/api.ts`): Clerk session **and** non-suspended account (fail closed if suspend check errors).
- Domain wrappers (`requireMemoryApiUser`, `requireFamilyApiUser`, `requirePeopleApiUser`) delegate to it.
- Admin APIs use `requireAdminApi()` (DB `is_admin` or `ADMIN_USER_IDS`); suspend check also fail closed.
- Admin pages: `(admin)/layout.tsx` → `requireAdmin()` + suspend redirect.
- Middleware protects app pages and `/api/*` user routes (including notifications + onboarding).
- Worker/cron routes: shared `authorizeWorkerRequest()` with timing-safe secret compare.
- `/api/dev/*` is **hard-disabled in production** even if `ALLOW_DEV_*` is set.

## Media & R2

- Public download signing (`getDownloadUrl`) requires `moderationStatus === "clean"` and refuses `quarantine/` keys.
- Gallery URLs are short-lived (≤30m gallery / ≤1h hard cap; movies ≤10m).
- Pending / quarantined / adult / rejected media are filtered from family listings.
- Movie play URLs are withheld if any linked memory media is no longer clean+ready.
- Upload complete no longer returns `originalKey` to the client.

## Input validation

- Mutating bodies use Zod schemas (titles, descriptions, invites, billing, notifications).
- Admin ILIKE search escapes `%` / `_` and caps length (`likeContainsPattern`).
- Person names capped at 120 characters.

## Rate limiting

In-memory sliding windows (`src/lib/security/rate-limit.ts`) on:

| Endpoint | Limit |
|----------|--------|
| `/api/upload-url` | 30 / min / user |
| `/api/media/complete` | 40 / min / user |
| `/api/family/invite` | 10 / min / user |
| `/api/family/accept` | 20 / min / user |
| `/api/memories/[id]/movies` POST | 8 / min / user |
| `/api/billing/*` | 10 / min / user |
| `/api/jobs/*` drains | 30 / min / IP |

For multi-instance production, swap the store for Redis/Upstash using the same helpers.

## Environment

- Secrets stay server-only (`CLERK_SECRET_KEY`, `DATABASE_URL`, R2, Stripe, worker secrets).
- Only `NEXT_PUBLIC_*` values are safe for the browser (publishable keys, app URL).
- Never set `ALLOW_DEV_MODERATE` / `ALLOW_DEV_FACES` in production.
- Always set a strong `WORKER_SECRET` in deployed environments.
