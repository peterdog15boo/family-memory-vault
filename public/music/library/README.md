# Movie soundtrack library

Built-in royalty-free beds for Family Memory Vault movies.

All masters are **Kevin MacLeod (incompetech.com)** under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — commercial-ready with attribution (shown in the music picker).

| File | Category | Source track |
| --- | --- | --- |
| `soft-piano.mp3` | Soft Piano | Meditation Impromptu 01 |
| `morning-keys.mp3` | Soft Piano | Dreamy Flashback |
| `quiet-keys.mp3` | Soft Piano | Gymnopedie No 1 |
| `gentle-acoustic.mp3` | Warm / Family | Wholesome |
| `vinyl-soft.mp3` | Warm / Family | Lobby Time |
| `family-porch.mp3` | Warm / Family | Easy Lemon |
| `quiet-score.mp3` | Cinematic | Virtutes Instrumenti |
| `ambient-pads.mp3` | Cinematic | Floating Cities |
| `film-rise.mp3` | Cinematic | Ascending the Vale |
| `festive-strings.mp3` | Holiday | Dance of the Sugar Plum Fairy |
| `carol-lite.mp3` | Holiday | Silent Night |
| `holiday-glow.mp3` | Holiday | Holiday Weasel |
| `light-ukulele.mp3` | Upbeat | Beachfront Celebration |
| `upbeat-pop.mp3` | Upbeat | Happy Boy Theme |
| `sunny-stride.mp3` | Upbeat | Jaunty Gumption |
| `soft-farewell.mp3` | Memorial / Reflective | Past Sadness |
| `long-memory.mp3` | Memorial / Reflective | Long Note Two |
| `gentle-goodbye.mp3` | Memorial / Reflective | Bittersweet |
| `social-spark.mp3` | Bright Social | Wallpaper |
| `feed-ready.mp3` | Bright Social | Carefree |
| `bright-scroll.mp3` | Bright Social | Monkeys Spinning Monkeys |

Rebuild trimmed masters:

```bash
python scripts/generate-library-music.py
```

Catalog metadata: `src/lib/movies/music/library.ts`. Replace any file in place (same filename) to upgrade a slot without code changes; bump `LIBRARY_MUSIC_ASSET_VERSION` so previews skip browser cache.

Export mix (ffmpeg): loops to movie length, fade in/out from settings, volume slider — see `mix.ts`.
