# Emergency Access (Digital Legacy)

Emergency access is a **break-glass** path for trusted contacts to read an owner's **Digital Legacy** vault. It is intentionally separate from **family sharing**, photo libraries, and normal document sharing.

## Important — not legal advice

Family Memory Vault is software, not an estate-planning service. Laws about digital assets, powers of attorney, executors, and post-death access vary widely by jurisdiction. Before relying on this feature for real-world planning:

- Consult a qualified **estate planning attorney** in your area
- Confirm whether app-based emergency access aligns with your will, trust, or fiduciary documents
- Consider formal legal instruments (executor designation, durable power of attorney, etc.) where appropriate

This feature helps trusted people find **instructions and contacts you chose to leave** — it does not replace probate, court orders, or provider-specific account recovery processes.

## How it differs from family sharing

| | Family sharing | Emergency access |
|---|----------------|------------------|
| Purpose | Share memories & albums | Break-glass access to Digital Legacy |
| Scope | Memories, shared media | Legacy profile, instructions, contacts, secure items, **legacy videos (playback)** |
| Access | Active family members | Explicitly designated contacts only |
| Activation | Immediate when shared | Requires designation + request + grant rules |

## Status workflow

```
(none)  →  designated  →  requested  →  granted
                              ↓           ↓
                           denied      expired*
```

\* Temporary grants expire after the configured duration. Permanent grants do not auto-expire — the owner must revoke (reset) or delete the designation.

- **none** — No designation exists for that contact
- **designated** — Owner named a trusted person by email
- **requested** — Trusted person initiated break-glass access; owner is notified
- **granted** — Read access is active (temporary until `grant_expires_at`, or permanent until revoked)
- **denied** — Owner declined the request
- **expired** — Temporary grant timed out; owner may reset to **designated**

## Access duration

| Type | Behavior |
|------|----------|
| **Temporary (365 days)** | Once granted, access ends after 365 days (or the stored `grant_duration_days` for older designations) |
| **Permanent Access** | Remains valid until the owner explicitly revokes it. Intended for trusted immediate family. Does not weaken authentication or waiting-period rules. |

Existing designations created before this option remain **temporary** with their original duration (commonly 30 days). They are not converted to permanent.

## Break-glass flow (v1)

1. **Owner designates** one or more trusted contacts (name + email)
2. Owner configures:
   - **Waiting period** (default 72 hours; `0` = manual approval only)
   - **Access duration** — 365 days (temporary) or Permanent Access
3. **Designatee** signs in with the matching email and may **request access**
4. **Owner is notified** in-app when a request is submitted
5. Owner may **grant immediately** or **deny**
6. If a waiting period is configured and the owner does not deny, access **auto-grants** when the waiting period ends
7. Legacy content is exposed **only while status is `granted` and the grant is active** (temporary: before expiry; permanent: until revoke)

## Security rules

- All legacy API routes for owners remain owner-only
- Grantees read through `/api/legacy/granted/[ownerUserId]` after `assertEmergencyLegacyReadAccess`
- Secure items are **redacted until grantee reveal** (same step-up rules as owner)
- Legacy videos appear as metadata in the granted vault; playback uses short-lived signed URLs via `POST /api/legacy/granted/[ownerUserId]/videos/[id]/playback` (never permanent links)
- Emergency packet exports list video **titles only** — no descriptions and no signed URLs
- Designatee identity is verified by matching the authenticated user's email to `designatee_email`
- Secure items and legacy data never appear in family galleries, Memories, Movies, notifications, emails, or assistant search

See [PRIVATE_VAULT_SECURITY.md](./PRIVATE_VAULT_SECURITY.md) and [DIGITAL_LEGACY_VIDEOS.md](./DIGITAL_LEGACY_VIDEOS.md) for the full security contract.

## Database

Migrations:

- `drizzle/0023_emergency_access.sql` — initial table
- `drizzle/0036_emergency_access_type.sql` — `access_type` (`temporary` \| `permanent`)

Table: `emergency_access_designations`

Apply locally:

```bash
npx tsx scripts/apply-0023-emergency-access.ts
npx tsx scripts/apply-0036-emergency-access-type.ts
```

## API routes

| Route | Role | Purpose |
|-------|------|---------|
| `GET/POST /api/emergency-access` | Owner | List / create designations |
| `PATCH/DELETE /api/emergency-access/[id]` | Owner | Update / remove |
| `POST /api/emergency-access/[id]/grant` | Owner | Approve access |
| `POST /api/emergency-access/[id]/deny` | Owner | Decline request |
| `POST /api/emergency-access/[id]/reset` | Owner | Return to designated |
| `GET /api/emergency-access/incoming` | Designatee | List designations for me |
| `POST /api/emergency-access/[id]/request` | Designatee | Start break-glass request |
| `GET /api/legacy/granted/[ownerUserId]` | Grantee | Read-only legacy vault (includes video metadata) |
| `POST /api/legacy/granted/[ownerUserId]/videos/[id]/playback` | Grantee | Short-lived playback or thumbnail URL |
| `GET /api/legacy/granted/[ownerUserId]/packet` | Grantee | Markdown export (video titles only) |

## UI entry points

- **Owner:** Documents → Digital Legacy → Emergency Access (`/documents/legacy/emergency`)
- **Designatee:** Emergency Access (`/emergency-access`)

## Future enhancements (not in v1)

- Email notifications in addition to in-app alerts
- Scheduled background job for transitions (currently evaluated on read)
- Scoped access (e.g. exclude secure items unless explicitly allowed)
- Multi-factor confirmation for grantees
- Audit log visible to owner
