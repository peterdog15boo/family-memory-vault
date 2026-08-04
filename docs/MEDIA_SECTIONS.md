# Media-backed sections

> **Preferred API:** [`CinematicSection`](./CINEMATIC_SECTIONS.md) from `@/components/cinematic`.
>
> `MediaSection` remains a compatibility alias for in-app call sites.

## Clean API

```tsx
import { CinematicSection } from "@/components/cinematic";

<CinematicSection
  mediaType="video"
  src="/marketing/hero.mp4"
  poster="/marketing/hero.jpg"
  overlay="dark"
  layout="center"
  glass="soft"
>
  <h2>Begin preserving what you love</h2>
</CinematicSection>
```

| Prop | Values | Notes |
|------|--------|--------|
| `mediaType` | `image` \| `video` \| `none` | `none` uses atmosphere fallback |
| `src` | URL | Image or video source |
| `poster` | URL | Required for good video UX; used under reduced motion |
| `overlay` | `dark` \| `dark-soft` \| `light` \| `light-soft` \| named veils | Always on — keeps text readable |
| `layout` | `center` \| `split-start` \| `split-end` \| `bottom` \| `fill` | Content placement over media |
| `glass` | `false` \| `true` \| `soft` \| `strong` | Optional frosted content panel |
| `priority` | boolean | Eager-load heroes (LCP); non-hero media lazy-activates near viewport |
| `viewport` | boolean | Full viewport min-height |
| `treatment` | preset id | Optional named look; explicit props override |

### Overlay tokens

- **dark / dark-soft** — light text over photo/video
- **light / light-soft** — dark ink over media (warm product default)
- Named veils: `hero-cinematic`, `hero-veil`, `dual-fade`, `center-veil`, `cta-glow`, `welcome-veil`, `legacy-veil`

## Components

| Export | Role |
|--------|------|
| `CinematicSection` | Preferred public API (`@/components/cinematic`) |
| `MediaSection` | Alias — same props; keep for vault / onboarding |
| `CinematicBackdrop` / `MediaBackdrop` | Image / soft video / atmosphere + readability overlay |
| `GlassPanel` | Frosted content panel |
| `usePrefersReducedMotion` | Disables video + sheen when requested |
| `resolveMediaSection` | Merges treatment defaults with explicit props |

## Treatments (optional presets)

Defined in `src/lib/media-section/treatments.ts`. Useful for consistent landing bands:

| Id | Use |
|----|-----|
| `heroWarm` | Landing hero |
| `promiseQuiet` | Emotional promise |
| `featureSoft` / `bandWarm` / `bandRose` | Feature media bands |
| `trustMist` | Trust / family band |
| `ctaGlow` | Final CTA |
| `welcomeSoft` | Onboarding welcome |
| `legacyDusk` | Digital Legacy intro |

## Rules

1. **Readability first** — overlays always render; use `glass` for dense copy on busy media.
2. **Video** — autoplay, muted, loop, `playsInline`; always provide `poster`.
3. **Reduced motion** — video does not play; poster (or atmosphere) shows instead.
4. **Performance** — WebP/AVIF stills (~250KB), short muted WebM/MP4 (~2MB, ≤720p); non-hero media loads only when near the viewport; images lazy-load unless `priority`.

## Adding assets

1. Prefer overwriting files under `/public/marketing/` using the filenames in `docs/LANDING_MEDIA.md`.
2. Paths are registered in `src/content/landing-media.ts` and bound in `src/content/landing.ts`.
3. Always provide a poster when using video.

See also `docs/CINEMATIC_SECTIONS.md`, `public/marketing/README.md`, and `docs/LANDING_MEDIA.md`.
