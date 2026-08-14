# Admin tools

Internal console for Family Memory Vault. **Not customer-facing.**

All `/admin/*` pages and `/api/admin/*` routes require a signed-in **admin**
(`users.is_admin` or `ADMIN_USER_IDS` bootstrap). Suspended accounts cannot use
admin APIs.

## Access

| Method | How |
|--------|-----|
| Database flag | `users.is_admin = true` |
| Env bootstrap | `ADMIN_USER_IDS=user_xxx,user_yyy` in `.env.local` |

Helpers (`src/lib/auth/admin.ts`):

- `isAdmin(userId)` — async check
- `requireAdmin()` — pages/layouts (redirects if not admin)
- `requireAdminApi()` — API routes (returns 401/403)
- `assertAdminUser(userId)` — throws if not admin

### Promote yourself (dev)

Sign in once so your `users` row exists, then:

```bash
npm run admin:promote -- --email=you@example.com
# or
npm run admin:promote -- --userId=user_xxxxxxxx
```

## Tool overview

| Route | Purpose |
|-------|---------|
| `/admin` | Overview snapshot + links |
| `/admin/users` | Search users; change plan + grant/revoke admin inline; storage / last active |
| `/admin/users/[id]` | Detail, plan override, suspend, admin grant |
| `/admin/safety` | Moderation counts, quarantines, NCMEC, paginated media |
| `/admin/safety/[mediaId]` | Metadata-only inspect (no CSAM previews) |
| `/admin/review` | Human review queue (blurred previews + audited decisions) |
| `/admin/movies` | Movie generation snapshot |
| `/admin/analytics` | Product metrics (users, storage, moderation mix) |
| `/admin/ops` | Queue health, errors, failed job retry |
| `/admin/audit` | Admin action audit log |

## Destructive / sensitive actions

These ask for confirmation in the UI and write to `admin_audit_logs` via
`logAdminAudit()` (`src/lib/admin/audit.ts`):

- Change plan (DB override — not Stripe)
- Suspend / unsuspend user
- Grant / revoke admin
- Moderation review decisions (clean / adult / reject / CSAM quarantine)
- Retry failed processing jobs

## Auditing

```ts
import { logAdminAudit } from "@/lib/admin/audit";

await logAdminAudit({
  actorId,
  action: "user.suspend",
  targetType: "user",
  targetId,
  metadata: { reason },
});
```

Logging never throws — failures go to the server console only.

## Migrations

```bash
npx tsx scripts/apply-0013-is-admin.ts
npx tsx scripts/apply-0014-suspend.ts
npx tsx scripts/apply-0015-audit.ts
```

Or apply the SQL under `drizzle/0013_*` … `0015_*` against Neon.
