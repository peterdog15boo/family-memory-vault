# Public-beta polish sweep

Consistency and simple-bug fixes only. No restyle, no new features. Movie encoder, Plaid, social import, and Twilio were not touched.

Verified with unit tests (`people-rename`, Ask AI `resolve`, person-media counts, family map UI, will-planner, i18n). Public pricing on localhost shows **Free / Family / Legacy+** in beta mode. `/photos` redirects to `/media` (307). Signed-in People rename, Memories actions, Ava popups, and will-draft Documents save were not exercised in the browser (app requires login).

---

## 1. People names

People display name (`people.name`) is the only name shown. Clerk accounts are unchanged.

### Source of truth

- `renamePerson` updates `people.name` and, in the same save, stores the previous name in `people.name_aliases` (JSON array, cap 20). Auto labels like “Person 3” are not aliased.
- Family tree nodes whose `label` still equals the old name (or old display name) are updated to the new display name in that same save. Custom tree labels are left alone.
- Face labels, People list/detail, and Ask AI resolve people via `personId` → current `people.name`. Ask AI still matches aliases, but replies and action labels use the **current** name.
- After a rename, Person detail calls `router.refresh()` so list, detail, and other live joins pick up the new name immediately.

### Counts

- People cards and Person detail now use the same visibility helper (`countVisibleMediaLinkedToPeople` / `listVisibleMediaLinkedToPerson`): clean/ready photos, owned or family-shared.
- Detail gallery subtitle uses `photoCount` (uncapped), not the gallery array (capped at 100).

### Tests

- `src/lib/people/people-rename.test.ts` — alias merge; Ask AI matches “Craig Hale” after rename to “Craig” and returns **Craig**; Person detail applies PATCH + `router.refresh()`.
- `src/lib/ai/resolve.test.ts` — alias match returns current display name.
- `src/lib/people/person-media.test.ts` — list uses the shared counter.

### Migration

- Command: `npm run db:migrate` (this Windows Node process exited 1 with only the “applying migrations…” spinner). Re-ran `node --use-system-ca ./node_modules/drizzle-kit/bin.cjs migrate` — **0077 applied** (`migrations applied successfully!`).
- Result: `people.name_aliases` exists on the DB from `.env.local` (`jsonb`, NOT NULL, default `'[]'::jsonb`), confirmed via `getDb()`.
- Vercel deploy does not migrate Neon. If production uses a different `DATABASE_URL`, run the same migrate command with that URL once.

---

## 2. Words users see

### Photos, not Media

English (and the matching locale strings we grepped) now say Photos / photo library:

- Nav stays `nav.photos` → “Photos”; `/media` is still the route.
- Upload safety: **“Safety first: Every upload stays private while it is scanned. Ready photos appear in your library automatically.”** (`copy.ts` + `en-US` `safetyFirst` + `safetyNote`).
- Empty states, zip import, merge copy, Ask AI “View {name}'s photos”, “Open photo library”, Memory Box digitized-photos copy.
- Locale files + extras: `viewPersonsMedia`, `openMediaLibrary`, `people.emptyMediaTitle`, `people.mergeIntoBody`, Memory Box `estimatesAck`.

### Ask AI vs Ava

- Ask AI is the robot (nav, emails, first-family-movie wait slides, help knowledge).
- Ava remains the helper only (Ava helper UI, identity setup tips).
- Help keyword `family plus` → `legacy+`.

### Plans

- Landing teaser and pricing metadata: **Free, Family, Legacy+**.
- Beta pricing page (verified): Free, Family, Legacy+.
- 4K movie copy: “Family or Legacy+” (UI + lifecycle error). Not Family Plus.

### Will / trust stay drafts

- No “Create your will” / “your will is ready”.
- Will planner still: planning draft, not a legal will (`WILL_DISCLAIMER_TITLE`, help knowledge).
- List aria-label: “Will planner drafts” (not “Your will drafts”).

---

## 3. Simple bugs

| Issue | Fix |
| --- | --- |
| `/photos` 404 | Redirects `/photos`, `/photos/:path*`, `/gallery`, `/library` → `/media`. Route announcer maps `/media` to Photos. |
| Dead “coming soon” for built features | None found. Remaining “coming soon”: social import (intentional, not touched) and Stripe “Billing coming soon” when checkout isn’t live. |
| Ava double popups | Auto-open reasons persist in `sessionStorage` (`fmv.ava.autoOpenReasons`). Strict Mode remounts reuse that set. Idle re-prompt is skipped if `identity_setup` already ran this session. |
| Invite SMS | Invite copy already email-only (`family.inviteLead`). No SMS/Twilio promise in app or email. |
| Family map without API key | If Mapbox is not configured, Leaflet does not mount. Calm unavailable panel + member list if anyone shared a location. |
| Memories Make Movie / Edit / Add photos | Owned cards (old and new) show Edit, Add photos (`?addPhotos=1`), Make Movie (`?createMovie=1`). Detail honors `startAddPhotos`. |
| Will draft → Documents | `generateAndSaveWillDraft` already upserts into Private Documents → Wills / Estate. Upsert errors are **rethrown when R2 is configured** so generate no longer looks successful with no PDF. Without R2, markdown still saves and the upsert is skipped. |
| Raw i18n keys | Translators fall back to `en-US`. No missing-key smoke in this sweep. If a key exists in English, other locales show English rather than `family.someKey`. |

---

## Files touched (summary)

**People:** `src/lib/people/name-aliases.ts` (new), `index.ts`, `person-media.ts`, `schema.ts`, `drizzle/0077_people_name_aliases.sql`, `PersonDetailView.tsx`, `PeopleList.tsx`, `src/lib/ai/resolve.ts`, tests.

**Copy:** `copy.ts`, `en-US.ts`, locale dictionaries, extras round 2/3, `landing.ts`, pricing metadata, `CreateMoviePanel.tsx`, `lifecycle.ts`, `knowledge.ts`, wait slides.

**Bugs:** `AvaHelper.tsx`, `FamilyLocationMap.tsx`, `MemoryList.tsx`, `MemoryDetailView.tsx`, `memories/[id]/page.tsx`, `next.config.ts`, `RouteAnnouncer.tsx`, `will-planner/drafts.ts`, `WillDraftsList.tsx`.

---

## What we did not change (do not regress)

- Clean/ready media only on Photos, People, Movies, Family, Ask AI.
- No cross-user library leak (person media still uses `loadCleanAccessibleMediaByIds` + owner/family owners).
- Confirm-before-write on Ask AI and private vault — not touched.
- `private-documents` / `private-legacy` stay out of gallery downloads (will PDF still uses private-document storage keys only).
- Documents, Digital Legacy, Will/Trust stay Legacy+ only.
- Will/trust remain DRAFT, not a legal document.

---

## Left for beta testers

1. **`0077_people_name_aliases` is applied on the `.env.local` database.** Production/Vercel does not migrate Neon automatically — run migrate once against that `DATABASE_URL` if it is a different database.
2. **Social import** (Facebook / Instagram / TikTok connect) is still “Coming soon”. Zip upload is the real path. Do not treat that copy as a dead link.
3. **Family Plus** still exists internally (`family_plus` / Stripe). Grandfathered billing rows may still say Family Plus. Public beta picker is Free / Family / Legacy+. Do not expect Family Plus to be renamed in the database.
4. **Will PDF in Documents** requires R2. Without R2, the planner draft markdown saves, but there is no Private Documents file under Wills / Estate.
5. **Family map tiles** need `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` (`pk.…`). Missing key now shows a calm empty/unavailable state instead of a broken map.
6. **Invites are email-only.** Twilio/SMS is not live; we did not add SMS copy.
7. **Movie encoder, Plaid, social OAuth, Twilio** were not in this sweep.
8. **People card vs detail wording:** cards say “N photos”; detail subtitle still uses “N item(s)” (photos + videos). The **number** should match; the word may differ when videos are included.
9. **Cached titles:** we did not rewrite old Memory/movie titles that happen to contain a person’s former name. Live labels (People, faces, Ask AI, tree nodes that still matched the old name) follow the rename.
10. **Other-locale leftovers:** some non-English strings may still say “medios / Medien / media” in less-used keys (e.g. memories safety notes). English and the high-traffic keys above were aligned. Missing keys fall back to English, not raw `dotted.keys`.
11. **Ava auto-open lock** is per browser tab session (`sessionStorage`). A new tab can auto-open again once.
12. **4K / plan copy** says Family or Legacy+. A Family Plus subscriber still has the feature; the user-facing plan names are Free, Family, Legacy+.
