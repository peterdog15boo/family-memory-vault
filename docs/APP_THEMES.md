# App themes (Modern / Original)

Family Memory Vault supports a **reversible** visual theme system.

**Modern is the site default** for new visitors and anyone without a saved preference. **Original** remains available in Settings → Appearance. Existing devices that already saved Original keep that choice.

## Themes

| Id | Feel |
|----|------|
| `modern` (**default**) | Cinematic public landing, soft off-whites, clay-rose accent, calmer app shell |
| `original` | Familiar warm vault look + simpler public landing |

## Choosing a look

| Control | Where | Purpose |
|---------|--------|---------|
| **Settings → Appearance** | `/settings#appearance` | Permanent control on this device |
| **Deep-link** | `?theme=modern` or `?theme=original` | Explicit override (also persists) |

Global Design Preview banners / floaters are no longer shown site-wide. Theme switching lives in Settings.

### What each theme owns

| Surface | Modern | Original |
|---------|--------|----------|
| Landing `/` | Cinematic scroll story | Classic hero + privacy / how-it-works |
| Sign-in / Sign-up | Full-bleed cinematic auth | Split collage + form |
| Pricing `/pricing` | Cinematic hero + calm plans | Classic SaaS pricing layout |
| App shell | Gallery-first consumer chrome + per-page full-bleed heroes | Familiar denser vault |

Switching only changes visuals on this device — never auth sessions, memories, or data.

### Persistence

- Preference key: `localStorage.fmv-app-theme` = `modern` \| `original`
- Applied as `data-theme` on `<html>` (boot script before hydration — no flash)
- **Default when unset:** `modern`
- Saved `original` preferences are never overwritten by the new default
- Deep-link: `?theme=modern` or `?theme=original` (also persists)
- Multi-tab: `storage` events keep tabs in sync

### Suggested walkthrough

1. Open the site in a fresh profile / cleared `fmv-app-theme` — should boot **Modern**.
2. Check: Landing → Sign-in → Pricing → Dashboard → Settings → Appearance.
3. Switch to **Original** in Settings — public pages and app chrome should update immediately.
4. Reload — Original should stick. Clear the storage key (or use another browser) — Modern returns.

## How it works (architecture)

1. Tokens: `:root` / `[data-theme="original"]` and `[data-theme="modern"]` in `src/app/globals.css`.
2. `ThemeProvider` syncs React state ↔ `data-theme` ↔ `localStorage`.
3. Boot script in `src/app/layout.tsx` applies stored theme (or Modern default) before paint.
4. Tailwind colors (`canvas`, `ink`, `accent`, …) map to CSS variables.
5. Documents / Legacy use `--doc-*` / `--legacy-*` (also theme-scoped).
6. Shared primitives (`.ui-btn`, `.ui-input`, `.ui-card`, `.ui-modal-*`, `.ui-nav-*`, `.ui-empty`) upgrade under Modern only.
7. Landing forks Original vs Modern compositions via `LandingPage` + theme.

## Modern visual language (summary)

- **Type / color / layout / primitives** — see tokens in `globals.css` `[data-theme="modern"]`
- **Landing** — `src/components/marketing/*`, copy in `src/content/landing.ts`, media registry in `src/content/landing-media.ts` (`docs/LANDING_MEDIA.md`)
- **App page heroes (Modern)** — full-bleed intros via `AppPageIntro` / `PageHero`; replaceable stills in `/public/app-heroes/` (`src/content/page-hero-media.ts`, `public/app-heroes/README.md`)
- **App footer (Modern)** — cinematic close via `AppFooter` in `DashboardShell` (`/app-heroes/footer.jpg`)
- **Brand logo (Modern)** — `BrandLogo` + `/public/brand/` (`src/content/brand.ts`)
- **Shell** — quieter daily-use polish via `.dashboard-*`, `.app-stack`, `.list-card`, `.media-tile`, `.page-header` (not cinematic)
- **Media sections** — `docs/MEDIA_SECTIONS.md`
- **Motion** — Modern-only; respects `prefers-reduced-motion`

---

## Developer guide: theme-safe components

### Prefer tokens, not hex

```tsx
// ✅ Theme-safe
className="bg-canvas text-ink border-ink/10"
className="bg-[color:var(--accent)] text-[color:var(--accent-foreground)]"

// ❌ Breaks switching (looks “Original” or “Modern” forever)
className="bg-[#f3f1ec] text-[#4a7c6f]"
style={{ color: "#b56f5e" }}
```

### Use shared primitives

| Need | Use |
|------|-----|
| Button | `UiButton` / `.ui-btn` |
| Input | `UiInput` / `.ui-input` |
| Card | `UiCard` / `.ui-card` or `.list-card` |
| Empty | `EmptyState` / `.ui-empty` |
| Page title | `PageHeader` / `.page-title` `.page-lead` |
| Modal | `.ui-modal-backdrop` + `.ui-modal-panel` |

### Modern-only polish

Add hooks, style under `[data-theme="modern"]` only:

```css
/* Base = Original-friendly */
.my-panel {
  border: 1px solid var(--border-subtle);
  background: var(--surface-elevated);
}

/* Modern upgrades — never change the base rule’s Original look */
[data-theme="modern"] .my-panel {
  border-radius: var(--ui-card-radius);
  box-shadow: var(--shadow-md);
}
```

Avoid forking React trees by theme unless the structure truly differs (landing is the main exception).
