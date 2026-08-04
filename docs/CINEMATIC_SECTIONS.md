# Cinematic sections

Reusable full-bleed backgrounds for public pages (landing, auth, marketing).

## API

```tsx
import { CinematicSection } from "@/components/cinematic";

<CinematicSection
  mediaType="video"
  src="/marketing/hero.mp4"
  poster="/images/hero/frame-a.jpg"
  overlay="dark"
  layout="center"
  glass="soft"
  priority
  viewport
>
  <h1>Keep what love leaves behind.</h1>
</CinematicSection>
```

| Prop | Values | Notes |
|------|--------|--------|
| `mediaType` | `image` \| `video` \| `none` | `none` uses atmosphere fallback |
| `src` | URL | Image or video source |
| `poster` | URL | Required for video; used under reduced motion |
| `overlay` | `dark` \| `dark-soft` \| `light` \| `light-soft` \| named veils | Always on — keeps text readable |
| `layout` | `center` \| `split-start` \| `split-end` \| `bottom` \| `fill` | Content placement |
| `glass` | `false` \| `true` \| `soft` \| `strong` | Optional frosted content panel |
| `priority` | boolean | Eager-load heroes / auth (LCP) |
| `viewport` | boolean | `min-height: 100svh / 100dvh` |
| `treatment` | preset id | Optional named look; explicit props override |

## Behavior

1. **Video** — muted, looping, `playsInline` autoplay; paused when off-screen
2. **Reduced motion** — video does not play; poster / still shows instead
3. **Lazy load** — non-`priority` media activates ~240px before entering the viewport
4. **Overlays** — always render so copy stays readable on desktop and mobile
5. **Glass** — optional frost for dense copy on busy photography

## Overlays

- **dark / dark-soft** — light text over photo/video
- **light / light-soft** — dark ink over media
- Named: `hero-cinematic`, `hero-veil`, `dual-fade`, `center-veil`, `cta-glow`, `welcome-veil`, `legacy-veil`

## Components

| Export | Role |
|--------|------|
| `CinematicSection` | Section + backdrop + layout + optional glass |
| `CinematicBackdrop` | Image / video / atmosphere + readability overlay |
| `GlassPanel` | Frosted content panel |
| `usePrefersReducedMotion` | Disables video + sheen when requested |

Import from `@/components/cinematic`.

`MediaSection` in `@/components/media-section` remains a thin alias for older call sites (onboarding, legacy, people).

## Used by

- Landing hero (`LandingHero`)
- Landing story / promise / trust / how / CTA stages
- Modern sign-in / sign-up (`AuthPageShell`)

See also `docs/LANDING_MEDIA.md` and `public/marketing/README.md`.
