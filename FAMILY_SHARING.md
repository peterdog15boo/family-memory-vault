# Family sharing & privacy model

How households share content in Family Memory Vault, and what stays private.

This complements [SAFETY.md](./SAFETY.md) (moderation) and [FACES.md](./FACES.md) (people/faces).

---

## Roles

| Role | View shared content | Contribute to shared memories | Manage members / invites | Delete family |
| --- | --- | --- | --- | --- |
| **owner** | Yes | Yes | Yes | Yes |
| **member** | Yes | Yes (when memory allows) | No | No |
| **viewer** | Yes | No | No | No |

Membership must be **active**. Pending invites cannot access anything until accepted.

---

## What is shared (and what is not)

### Media (photos / videos)

- **Family members see each other’s clean, ready media** in “Shared with family” galleries (dashboard + `/media`).
- That means: `moderation_status = clean` **and** `status = ready` only.
- **Never visible to family (or anyone on family surfaces):**
  - `pending` / `pending_moderation`
  - `needs_human_review`
  - `adult`
  - `rejected`
  - `csam_quarantined`
- Review banners and quarantine counts are **owner-only** — family never sees another member’s safety pipeline state.
- Signed download URLs refuse anything that is not `clean`.

### Memories (albums / stories)

- Memories are **private by default**.
- Owners opt in with **Share with family** on the memory detail page.
- Optional access level:
  - **View only** — family can open the album and its clean media
  - **View and contribute** — family owners/members may edit title/description/settings; media add/remove/cover stays **owner-only** for now
- Unshared memories are not listed under “Shared with family” and return 404 to non-owners.

### People / faces

- **Not shared via family.** Each account’s People library is owner-scoped (`user_id`).
- Face detection only runs on that user’s clean/ready photos.
- `canViewPerson` is owner-only until an explicit people-sharing feature exists.

---

## Invite flow (authorization)

1. Owner invites by email → pending `family_members` row + opaque `invite_token`.
2. Invitee opens `/family/accept?token=…` while signed in.
3. Accept API requires:
   - Signed-in Clerk user (`requireFamilyApiUser`)
   - Valid **token** (member id is not accepted)
   - Account email must match `invited_email`
4. On success: `status = active`, `userId` linked, token cleared.

Pending invite emails are shown in full to **owners**; other members see a **redacted** address.

---

## API authorization checklist

Every `/api/family/*` route requires a signed-in user. Additional rules:

| Route | Extra authorization |
| --- | --- |
| `GET /api/family` | Active memberships only |
| `POST /api/family` | Any signed-in user (becomes owner) |
| `POST /api/family/invite` | Active **owner** |
| `POST /api/family/accept` | Token + email match |
| `GET /api/family/[id]/members` | Active member; email redaction for non-owners |
| `PATCH/DELETE …/members/[memberId]` | Active **owner** |
| `POST /api/family/[id]/leave` | Active **non-owner** |

Middleware also protects `/family(.*)` and `/api/family(.*)`.

Implementation: `src/lib/families/**`, `src/lib/permissions.ts`, `src/app/api/family/**`.

---

## Safety invariants (do not break)

1. Family surfaces must use `clean` + `ready` (never rely on “family trusted” to skip moderation).
2. Memory share flags do not bypass media moderation — linked media are still filtered.
3. People/faces remain private per account unless a future feature opts in explicitly.
4. Invite tokens are the only public accept credential; do not accept by member row id.
5. Prefer `requireFamilyApiUser` + `requireFamilyApiOwner` / `requireActiveFamilyMember` at the route boundary, with helpers as a second layer.

---

## Product note: media vs memories

Today, **joining a family shares your clean media library** with co-members, while **memories require an explicit share toggle**. That asymmetry is intentional for the current product:

- Media: household photo pool after moderation  
- Memories: curated albums you choose to publish to the family  

If you later need per-photo opt-in, add a media share flag (or album) and gate `getAccessibleMediaFilter` / `canViewMedia` the same way memories use `sharedWithFamily`.
