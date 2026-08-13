# Transactional email (Resend)

Family Memory Vault sends optional transactional mail via [Resend](https://resend.com). Auth emails (sign-in, verify) stay with **Clerk**.

## Env

```env
RESEND_API_KEY=re_xxxxxxxx
EMAIL_FROM="Family Memory Vault <support@mail.familymemoryvault.ai>"
EMAIL_REPLY_TO=support@familymemoryvault.ai
NEXT_PUBLIC_APP_URL=https://yourdomain.com
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `RESEND_API_KEY` | For real sends | Resend API key |
| `EMAIL_FROM` | Recommended | From header (display name + address). Defaults in code to `Family Memory Vault <support@mail.familymemoryvault.ai>` |
| `EMAIL_REPLY_TO` | Optional | Default Reply-To. Defaults to `support@familymemoryvault.ai`. Per-send overrides still win (e.g. feedback replies to the submitter) |

- Without `RESEND_API_KEY`, `sendEmail` **logs** the message to the console and returns `{ ok: true, logged: true }` — no network call.
- `EMAIL_FROM` must use a domain **verified in Resend**. Production uses the `mail.familymemoryvault.ai` subdomain (`support@mail.familymemoryvault.ai`).
- All app-owned transactional mail (invites, lifecycle, admin alerts) goes through `src/lib/email.ts` and uses `EMAIL_FROM` / `EMAIL_REPLY_TO` unless a caller intentionally passes `from` / `replyTo`.

## Usage

```ts
import {
  sendWelcomeEmail,
  sendFamilyInviteEmail,
  sendMovieReadyEmail,
  sendStorageWarningEmail,
  sendPaymentSuccessEmail,
  sendPaymentFailedEmail,
  sendEmail,
  isEmailConfigured,
} from "@/lib/email";

await sendWelcomeEmail({ to: user.email, firstName: "Alex" });

await sendFamilyInviteEmail({
  to: "cousin@example.com",
  inviterName: "Jordan",
  familyName: "The Roberts Family",
  inviteUrl: "https://…/family/invite?token=…",
});

await sendMovieReadyEmail({
  to: user.email,
  movieTitle: "Christmas 2025",
  movieUrl: "https://…/movies",
});
```

Low-level:

```ts
await sendEmail({
  to: "you@example.com",
  subject: "Hello",
  html: "<p>Hi</p>",
  text: "Hi",
});
```

## Templates

| Helper | When to use |
|--------|-------------|
| `sendWelcomeEmail` | After first account / vault setup |
| `sendFamilyInviteEmail` | When inviting someone to a family |
| `sendMovieReadyEmail` | Movie render completed |
| `sendStorageWarningEmail` | Storage ≥80% or full |
| `sendPaymentSuccessEmail` | Optional — Stripe `invoice.paid` |
| `sendPaymentFailedEmail` | Optional — Stripe `invoice.payment_failed` |

HTML builders live in `src/lib/email/templates.ts`. The send service is `src/lib/email.ts`.

## Lifecycle wiring

| Email | Trigger |
|-------|---------|
| Welcome | First `ensureAppUser` insert (`src/lib/users.ts`) |
| Family invite | `POST /api/family/invite` after invite token + accept link |
| Movie ready | `generateMovie` when status → `ready` |
| Storage warning | `POST /api/media/complete` / quota block — 80% / 100%, deduped ~7 days |

Orchestration helpers: `src/lib/email/lifecycle.ts` (`queueWelcomeEmail`, `queueFamilyInviteLifecycle`, `queueMovieReadyLifecycle`, `queueStorageThresholdCheck`, `queueMediaReadyNotification`). Matching **in-app** notifications are created where a `userId` exists (`media_ready` is notification-only).

Full matrix: [NOTIFICATIONS.md](./NOTIFICATIONS.md).

## Notes

- Helpers never throw on Resend API errors — they return `{ ok: false, error }`. Callers can log and continue.
- Most lifecycle queues are fire-and-forget so email outages don’t fail uploads or movie jobs. **Family invites await delivery** — `POST /api/family/invite` returns an error if Resend is unset or the send fails (the pending invite is still saved so the owner can retry).
- Without `RESEND_API_KEY`, watch the server console for `[email] RESEND_API_KEY not set — logging email instead of sending`.
