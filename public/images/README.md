# Login & hero imagery

Warm family / memory photography for the Original landing frames and the sign-in / sign-up collage.

## Files

| Path | Used by |
|------|---------|
| `hero/frame-a.jpg` | Landing hero (large frame) |
| `hero/frame-b.jpg` | Landing hero (mid frame) |
| `hero/frame-c.jpg` | Landing hero (small frame) |
| `login/panel-1.jpg` | Auth collage (tall panel) |
| `login/panel-2.jpg` | Auth collage |
| `login/panel-3.jpg` | Auth collage |

Paths are registered in `src/content/auth-visuals.ts`. Overwrite files in place to refresh imagery.

## Notes

- Prefer soft, inviting lifestyle photography — cohesive tones across the set.
- Keep files lean (WebP/JPG ~200–350KB). `object-fit: cover` fills frames.
- Modern cinematic landing uses `/public/marketing/` instead; these assets support Original hero + auth pages.
