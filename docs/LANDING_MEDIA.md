# Landing media slots (placeholders ? final assets)

The cinematic public pages now use explicit media slots under `public/cinematic/`.
These placeholders are already wired in and meant to feel premium during design review, while still being easy to replace later.

## Quick replace (no code changes)

1. Export final assets using the **exact filenames** below.
2. Overwrite the files in `public/cinematic/`.
3. Hard-refresh the public pages.

Paths are registered in `src/content/landing-media.ts` and consumed by `src/content/landing.ts` plus `src/components/auth/AuthPageShell.tsx`.

## Slot map

| Experience | Slot | Replace this file | Optional video |
|------|------|-------------------|----------------|
| Landing hero | Hero background | `public/cinematic/hero-background.jpg` | `public/cinematic/hero-background.mp4` |
| Sign-in / sign-up | Auth background | `public/cinematic/sign-in-background.jpg` | � |
| Landing section 2 | Preserve what matters | `public/cinematic/section-preserve.jpg` | � |
| Landing section 3 | Private by design | `public/cinematic/section-private.jpg` | � |
| Landing section 4 | Turn moments into movies | `public/cinematic/section-movies.jpg` | � |
| Landing section 5 | Share with family | `public/cinematic/section-family.jpg` | � |
| Landing section 6 | Peace of mind / legacy | `public/cinematic/section-legacy.jpg` | � |
| Landing section 7 | Final CTA | `public/cinematic/section-final-cta.jpg` | � |

## Placeholder intent

The current placeholders are intentionally emotional and premium:

- sunset / shoreline family scene for the hero
- warm togetherness image for sign-in
- family/travel/play imagery for the story stages

They are not �final brand� assets, but they are good enough to avoid blank shells, gray boxes, or dead visual zones.

## Recommended specs

| Kind | Use | Spec |
|------|-----|------|
| Hero background video | Full-viewport muted loop behind headline | 8�15s, muted MP4/WebM, <=720p, lean file size; always keep the JPG poster |
| Hero / section stills | Story stages and auth background | Strong photography, negative space for type, no embedded text, <=250�400KB where practical |
| Auth background still | Sign-in / sign-up shell | Warm, welcoming, readable under dark veil |

## Code map

```text
src/content/landing-media.ts        registry of slot paths
src/content/landing.ts              landing copy + section bindings
src/components/marketing/*          landing hero, stages, final CTA
src/components/auth/AuthPageShell.tsx sign-in / sign-up background
public/cinematic/*                  replace-in-place asset slots
```

## Notes

- If you want a different filename later, update `LANDING_MEDIA` in `src/content/landing-media.ts`.
- The hero already supports video + poster.
- Overlays from the cinematic section system keep text readable, so placeholders do not need perfect text-safe composition.
