# App page heroes (`/public/app-heroes/`)

Replaceable full-bleed stills for **Modern** authenticated page headers and footer.

## Slots

| File | Page | Mood |
|------|------|------|
| `dashboard.jpg` | Dashboard | Warm family / home of memories |
| `media.jpg` | Media / Your photos | Photo library / camera roll |
| `memories.jpg` | Memories | Albums, storytelling, scrapbook |
| `people.jpg` | People | Portraits / faces / relationships |
| `movies.jpg` | Movies | Cinematic / filmstrip |
| `assistant.jpg` | Ask AI | Helpful, intelligent discovery |
| `documents.jpg` | Documents | Calm, secure vault |
| `legacy.jpg` | Digital Legacy | Peaceful, respectful soft light |
| `family.jpg` | Family | Togetherness / shared household |
| `settings.jpg` | Settings | Clean, calm, minimal premium |
| `upload.jpg` | Upload | Inviting camera-roll mood |
| `billing.jpg` | Billing & usage | Clean, trustworthy calm |
| `notifications.jpg` | Notifications | Calm, helpful awareness |
| `emergency.jpg` | Emergency Access | Peaceful, respectful |
| `footer.jpg` | App footer (all Modern app pages) | Quiet atmospheric close |

## Replacement rules

1. Keep the **filename** — code references `/app-heroes/{slot}.jpg`.
2. Prefer **16:9 or wider**, ~2400px on the long edge.
3. Leave a softer left/bottom third for type (heroes: titles; footer: brand + links).
4. Warm, premium, friendly photography — avoid harsh flash stock.
5. Registry copy lives in `src/content/page-hero-media.ts` (alt + art direction).

Original theme does not use these heroes or the cinematic app footer.
