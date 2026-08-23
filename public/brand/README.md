# Brand logos (`/public/brand/`)

Official Family Memory Vault lockups for the Modern experience.

| File | Use |
|------|-----|
| `logo.png` | Slate mark, transparent — light surfaces (nav solid, heroes with light veil, footer, settings) |
| `logo-light.jpg` | Same mark on light ground — optional / fallback |
| Dark photo surfaces | Use `logo.png` with `.brand-logo--on-dark` (CSS invert to white) |

Registry: `src/content/brand.ts` · Component: `src/components/brand/BrandLogo.tsx`

Free-plan movie exports also composite `logo.png` (when present) into a corner
watermark with the text “Created with Family Memory Vault”.

Keep filenames stable when replacing art. Preserve aspect (~712×464).
