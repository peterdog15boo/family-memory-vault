# Docs

Guides for Family Memory Vault features, ops, and localization.

| Doc | Topic |
| --- | --- |
| [PRIVATE_VAULT_SECURITY.md](./PRIVATE_VAULT_SECURITY.md) | Private documents vault security |
| [EMERGENCY_ACCESS.md](./EMERGENCY_ACCESS.md) | Digital Legacy emergency access |
| [DIGITAL_LEGACY_VIDEOS.md](./DIGITAL_LEGACY_VIDEOS.md) | Legacy video messages |
| [APP_THEMES.md](./APP_THEMES.md) | Original / Modern themes |
| [LANDING_MEDIA.md](./LANDING_MEDIA.md) | Marketing landing media |
| [MEDIA_SECTIONS.md](./MEDIA_SECTIONS.md) | In-app media section art |
| [CINEMATIC_SECTIONS.md](./CINEMATIC_SECTIONS.md) | Cinematic section styling |
| [AI_SOUNDTRACK.md](./AI_SOUNDTRACK.md) | Movie soundtrack generation |

Also see root docs: [README.md](../README.md), [SAFETY.md](../SAFETY.md), [ASSISTANT.md](../ASSISTANT.md), [TESTING.md](../TESTING.md).

---

## Languages (i18n)

The app UI defaults to **English (US)** (`en-US`). Signed-in users store a preference on `users.account_preferences.locale`. Guests use the `fmv-locale` cookie / localStorage. Missing translation keys deep-merge from English and never crash the UI.

### Supported locales

Order in the language selector (and `APP_LOCALES`):

1. `en-US` — English (US) — **default**
2. `es` — Español
3. `fr` — Français
4. `de` — Deutsch
5. `pt-BR` — Português (Brasil)
6. `zh-CN` — 简体中文
7. `ja` — 日本語
8. `ko` — 한국어
9. `it` — Italiano
10. `nl` — Nederlands

### How to add a new language later

1. **Register the locale** in `src/lib/i18n/locales.ts`:
   - Add the BCP 47 code to `APP_LOCALES` (keep `en-US` first).
   - Add a native-script label in `APP_LOCALE_LABELS`.
   - Extend `negotiateLocale()` so common `Accept-Language` tags map to your code.

2. **Add a dictionary** at `src/lib/i18n/dictionaries/<code>.ts`:
   - Export a partial `MessageTree` (you do **not** need every English key on day one).
   - Register it in `src/lib/i18n/dictionaries/index.ts`.
   - Prefer warm, simple family tone; keep product name **Family Memory Vault**; preserve `{placeholders}` exactly.

3. **Wire Ask AI language name** in `src/lib/ai/locale.ts` (`assistantLanguageName`).

4. **Smoke-check**:
   - Switch language in Settings / header — shell + main pages update.
   - Ava tips and Ask AI replies follow the selected language.
   - Dates/numbers/currency use `useFormat()` / `createFormatters()` (Intl).
   - A deliberately missing key still shows English (or the key in dev) without errors.

5. **Do not change** auth, upload safety, clean/ready media gates, or the beta NDA flow when adding strings — only copy and locale plumbing.

Code entry points: `@/lib/i18n` (client-safe), `@/lib/i18n/server` (`getLocale` / `getTranslations` / `getFormatters`), `<LocaleProvider>` + `useTranslations()` / `useFormat()` / `LanguageSwitcher`.
