/**
 * Curated collage tiles for the first-family-movie welcome screen.
 * Prefer unique, sharp stills — dedicated collage set + best in-repo heroes.
 */

export type FirstFamilyMovieCollageTile = {
  src: string;
  alt: string;
  /** CSS object-position for crop variety when a source is reused far apart. */
  focus?: string;
  /** Mosaic span hint: square | wide | tall */
  span?: "square" | "wide" | "tall";
};

/**
 * Unique sharp family / travel / celebration imagery.
 * Dedicated downloads live in /public/first-family-movie/collage/.
 */
export const FIRST_FAMILY_MOVIE_COLLAGE_SOURCES: readonly FirstFamilyMovieCollageTile[] =
  [
    { src: "/first-family-movie/collage/city-trip.jpg", alt: "Family trip abroad" },
    { src: "/first-family-movie/collage/kids-play.jpg", alt: "Children playing together" },
    { src: "/first-family-movie/collage/park-run.jpg", alt: "Family day outdoors" },
    { src: "/first-family-movie/collage/road-trip.jpg", alt: "Road trip adventure" },
    { src: "/first-family-movie/collage/mountain.jpg", alt: "Mountain getaway" },
    { src: "/first-family-movie/collage/dinner.jpg", alt: "Family dinner gathering" },
    { src: "/first-family-movie/collage/holiday-tree.jpg", alt: "Holiday celebration" },
    { src: "/first-family-movie/collage/carousel.jpg", alt: "Theme park carousel" },
    { src: "/first-family-movie/collage/coast-walk.jpg", alt: "Coastal walk" },
    { src: "/first-family-movie/collage/cruise-deck.jpg", alt: "Cruise vacation" },
    { src: "/first-family-movie/collage/beach-family.jpg", alt: "Beach day with family" },
    { src: "/first-family-movie/collage/camping.jpg", alt: "Family camping" },
    { src: "/first-family-movie/collage/pool.jpg", alt: "Poolside summer day" },
    { src: "/first-family-movie/collage/siblings.jpg", alt: "Siblings together" },
    { src: "/first-family-movie/collage/grandparents.jpg", alt: "Grandparents with kids" },
    { src: "/first-family-movie/collage/picnic.jpg", alt: "Family picnic" },
    { src: "/first-family-movie/collage/snow.jpg", alt: "Snow day memories" },
    { src: "/first-family-movie/collage/birthday.jpg", alt: "Birthday celebration" },
    // Best unique in-repo heroes (deduped — one path each)
    { src: "/app-heroes/people.jpg", alt: "People you love" },
    { src: "/app-heroes/media.jpg", alt: "Treasured photos" },
    { src: "/app-heroes/assistant.jpg", alt: "Warm family light" },
    { src: "/app-heroes/family.jpg", alt: "Family together outdoors" },
    { src: "/app-heroes/movies.jpg", alt: "Movie night warmth" },
    { src: "/images/hero/frame-a.jpg", alt: "Family gathered warmly" },
    { src: "/images/hero/frame-b.jpg", alt: "Parents and children outdoors" },
    { src: "/cinematic/sign-in-background.jpg", alt: "Welcoming family moment" },
  ] as const;

const FOCUS_PRESETS = [
  "center center",
  "top center",
  "bottom center",
  "left center",
  "right center",
  "30% 40%",
  "70% 35%",
  "45% 70%",
] as const;

const SPAN_CYCLE: Array<"square" | "wide" | "tall"> = [
  "square",
  "wide",
  "square",
  "tall",
  "square",
  "square",
  "wide",
  "square",
];

/**
 * Build a dense mosaic with minimal obvious repeats:
 * - prefer unique sources first
 * - when tiling beyond source count, space repeats apart
 * - vary crop focus so distant reuses don’t look identical
 */
export function buildFirstFamilyMovieCollage(
  tileCount = 48,
): FirstFamilyMovieCollageTile[] {
  const sources = [...FIRST_FAMILY_MOVIE_COLLAGE_SOURCES];
  const out: FirstFamilyMovieCollageTile[] = [];
  const lastIndexBySrc = new Map<string, number>();
  const minGap = Math.max(4, Math.floor(sources.length / 3));

  let cursor = 0;
  for (let i = 0; i < tileCount; i++) {
    let picked: (typeof sources)[number] | null = null;
    for (let attempt = 0; attempt < sources.length; attempt++) {
      const candidate = sources[(cursor + attempt) % sources.length]!;
      const last = lastIndexBySrc.get(candidate.src);
      if (last == null || i - last >= minGap) {
        picked = candidate;
        cursor = (cursor + attempt + 1) % sources.length;
        break;
      }
    }
    if (!picked) {
      picked = sources[i % sources.length]!;
      cursor = (i + 1) % sources.length;
    }

    const reuseCount = out.filter((t) => t.src === picked!.src).length;
    lastIndexBySrc.set(picked.src, i);
    out.push({
      src: picked.src,
      alt: picked.alt,
      focus: FOCUS_PRESETS[(i + reuseCount * 3) % FOCUS_PRESETS.length],
      span: SPAN_CYCLE[i % SPAN_CYCLE.length],
    });
  }

  return out;
}
