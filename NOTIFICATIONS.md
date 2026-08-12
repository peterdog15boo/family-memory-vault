# Notifications & email

Family Memory Vault uses **in-app notifications** (bell in the header), optional **transactional email** (Resend), and optional **Web Push** (this-device lock-screen alerts) for the same lifecycle moments.

Auth emails (sign-in, verify) stay with **Clerk**.

---

## In-app notifications

### Schema

Table `notifications` (`drizzle/0011_notifications.sql`):

| Column | Notes |
|--------|--------|
| `id`, `user_id` | Owner-scoped; cascade delete with user |
| `type` | Enum: `media_ready`, `movie_ready`, `family_invite`, `storage_warning`, `moderation_attention` |
| `title`, `message`, `link` | UI copy + deep link (app path preferred) |
| `read_at` | Null = unread |
| `metadata` | JSONB extras (`mediaId`, `percentUsed`, …) |
| `created_at` | Newest first in the UI |

Helpers: `src/lib/notifications/index.ts` (`createNotification`, `notify*`, `getUnreadNotifications`, `markAsRead`, `markAllAsRead`).

### UI

| Surface | Path |
|---------|------|
| Bell + dropdown | `NotificationBell` in app header |
| Full list | `/notifications` |
| APIs | `GET /api/notifications`, `POST /api/notifications/read` |

Clicking a row marks it read and navigates to `link` (absolute URLs are reduced to pathname + search).

While the app is open, an unread **increase** (polled) plays a soft ding (`/public/sounds/notification-ding.wav`) and gently highlights the bell until the panel is opened or everything is read. Existing unread on page load does not ding. Settings → **Play sound for new notifications** controls the sound (default on).

### When notifications are created

| Type | Trigger |
|------|---------|
| `media_ready` | Moderation marks media **clean** (worker or human review) |
| `movie_ready` | Movie render finishes (`generateMovie` → `ready`) |
| `family_invite` | Invite created **and** invitee already has a `users` row |
| `storage_warning` | Storage crosses ~80% or 100% (deduped ~7 days; can escalate once) |
| `moderation_attention` | Reserved for admin tooling later |

Orchestration: `src/lib/email/lifecycle.ts` (fire-and-forget `queue*` helpers).

### Deep links

| Type | Typical `link` |
|------|----------------|
| Media ready | `/media` |
| Movie ready | `/memories/{memoryId}` (fallback `/movies`) |
| Family invite | `/family/accept?token=…` |
| Storage | `/billing` |

---

## Transactional email (Resend)

See also [EMAIL.md](./EMAIL.md) for templates and env setup.

| Email | Trigger | Dev without key |
|-------|---------|-----------------|
| Welcome | First `ensureAppUser` insert | Logged to console |
| Family invite | `POST /api/family/invite` (accept URL in body) | Logged |
| Movie ready | Movie status → `ready` | Logged |
| Storage warning | Same threshold check as notifications | Logged |

`media_ready` is **in-app only** (avoids an email per photo).

Without `RESEND_API_KEY`, `sendEmail` returns `{ ok: true, logged: true }` and prints from/to/subject/text.

---

## Web Push (optional)

Opt-in per browser in Settings → Notifications → **This device**. Never auto-prompted. Requires HTTPS or localhost plus VAPID keys.

| Piece | Location |
|-------|----------|
| Keys | `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, optional `WEB_PUSH_VAPID_SUBJECT` (`mailto:` or `https:`) |
| Generate | `npx web-push generate-vapid-keys` |
| Table | `push_subscriptions` (`drizzle/0045_push_subscriptions.sql`) |
| Service worker | `/push-sw.js` (public; middleware skips static `.js`) |
| APIs | `GET /api/push/config`, `POST`/`DELETE /api/push/subscribe` |
| Send | `sendWebPushToUser` — major milestones + movie ready; prunes 404/410/403 endpoints |

Without VAPID keys, subscribe APIs return not configured and sends no-op. In-app + email still work.

---

## Onboarding

State lives on `users.onboarding` JSONB (`eligible`, `welcomeSeenAt`, `dismissedAt`, `completedAt`).

| Rule | Behavior |
|------|----------|
| **New users only** | `eligible: true` set on first user insert; legacy `{}` rows never see the checklist |
| **Show until** | Dismissed, or key steps done (welcome + first upload), or `completedAt` |
| **Optional steps** | Memory + invite shown while the card is visible; don’t block completion |
| **Dismiss** | `POST /api/onboarding` `{ action: "dismiss" }` |
| **Welcome step** | `{ action: "welcome_seen" }` |

UI: `OnboardingChecklist` on the dashboard. Progress for upload / memory / invite is derived from real tables (no extra write hooks).

---

## Code map

```
src/lib/notifications/     # DB helpers + typed notify*
src/lib/push/              # VAPID, subscriptions, send
src/lib/email.ts           # Resend send + template helpers
src/lib/email/templates.ts # HTML/text builders
src/lib/email/lifecycle.ts # Wire emails + notifications to product events
src/lib/onboarding/        # Progress + dismiss
src/components/notifications/
src/components/onboarding/
```
