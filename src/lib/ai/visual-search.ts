/**
 * Synonym expansion + visual search helpers for Ask AI.
 *
 * Expands everyday concepts (objects, settings, people categories) so
 * retrieval matches related ai_tags / ai_objects / ai_scenes labels.
 */

import { normalizeVisionToken } from "@/lib/ai/vision";

/** Query term → related index terms (bidirectional matching via expansion). */
const VISUAL_SYNONYMS: Record<string, string[]> = {
  // Inflatables / party
  inflatable: [
    "bounce house",
    "bouncy castle",
    "bouncy house",
    "obstacle course",
    "inflatable obstacle",
    "moonwalk",
    "jump house",
  ],
  "bounce house": [
    "inflatable",
    "bouncy castle",
    "bouncy house",
    "moonwalk",
    "jump house",
    "obstacle course",
  ],
  "bouncy castle": ["bounce house", "inflatable", "bouncy house"],
  "obstacle course": [
    "inflatable",
    "bounce house",
    "inflatable obstacle",
    "playground",
  ],

  // Food / celebration
  cake: ["birthday cake", "dessert", "cupcake", "wedding cake"],
  "birthday cake": ["cake", "birthday", "dessert"],
  wedding: ["bride", "groom", "ceremony"],
  graduation: ["graduate", "cap and gown", "diploma"],
  party: ["celebration", "gathering", "birthday", "party"],

  // Smoking / formalwear
  cigar: ["cigars", "smoking", "tobacco", "smoke"],
  cigars: ["cigar", "smoking", "tobacco"],
  smoking: ["cigar", "cigars", "tobacco", "cigarette"],
  tobacco: ["cigar", "smoking"],
  suit: ["suits", "tuxedo", "tux", "formalwear", "blazer", "jacket"],
  suits: ["suit", "tuxedo", "formalwear"],
  tuxedo: ["suit", "tux", "formalwear"],
  formalwear: ["suit", "tuxedo", "tie", "dress"],
  tie: ["ties", "necktie", "neck tie", "bow tie", "bowtie"],
  ties: ["tie", "necktie", "bow tie"],
  necktie: ["tie", "neck tie", "bow tie"],
  "bow tie": ["tie", "bowtie", "necktie"],
  bowtie: ["bow tie", "tie"],
  dress: ["dresses", "gown", "formalwear"],
  dresses: ["dress", "gown"],

  // People categories (visual demographics — not People-list names)
  man: ["men", "male", "gentleman", "gentlemen", "guy"],
  men: ["man", "male", "gentleman", "gentlemen", "guys"],
  male: ["man", "men", "gentleman"],
  gentleman: ["gentlemen", "man", "men", "male", "suit"],
  gentlemen: ["gentleman", "man", "men", "male"],
  woman: ["women", "female", "lady", "ladies"],
  women: ["woman", "female", "lady", "ladies"],
  female: ["woman", "women", "lady"],
  lady: ["ladies", "woman", "women"],
  ladies: ["lady", "woman", "women"],
  boy: ["boys", "child", "kid", "kids", "children", "son"],
  boys: ["boy", "child", "kid", "kids", "children"],
  girl: ["girls", "child", "kid", "kids", "children", "daughter"],
  girls: ["girl", "child", "kid", "kids", "children"],
  child: ["kid", "kids", "children", "boy", "girl"],
  kids: ["kid", "child", "children", "boys", "girls"],
  children: ["child", "kid", "kids", "boys", "girls"],

  // Settings / scenes
  beach: ["ocean", "shore", "shoreline", "sand", "seaside", "coast", "seaside"],
  shoreline: ["beach", "shore", "ocean", "sand"],
  ocean: ["beach", "sea", "water", "shore"],
  sand: ["beach", "shore"],
  indoor: ["indoors", "inside", "interior", "indoor scene"],
  indoors: ["indoor", "inside", "interior"],
  inside: ["indoor", "indoors", "interior"],
  interior: ["indoor", "indoors", "inside"],
  outdoor: ["outdoors", "outside", "exterior", "outdoor scene"],
  outdoors: ["outdoor", "outside", "exterior"],
  outside: ["outdoor", "outdoors", "exterior"],
  exterior: ["outdoor", "outdoors", "outside"],
  office: ["workplace", "desk", "indoors", "indoor"],
  home: ["house", "living room", "indoors", "indoor"],

  // Nature / time
  sunset: ["dusk", "golden hour", "sun"],
  "christmas tree": ["christmas", "holiday tree", "xmas tree", "pine tree"],
  christmas: ["christmas tree", "holiday", "xmas"],

  // Vehicles / pets / play
  bicycle: ["bike", "cycling", "pedal"],
  bike: ["bicycle", "cycling"],
  car: ["cars", "automobile", "vehicle"],
  cars: ["car", "automobile", "vehicle"],
  dog: ["puppy", "canine", "pet", "dogs"],
  dogs: ["dog", "puppy", "pet"],
  puppy: ["dog", "pet"],
  playground: ["park", "swing", "slide", "jungle gym"],
  pool: ["swimming pool", "swim", "swimming"],
  "swimming pool": ["pool", "swim", "swimming"],
  barbecue: ["bbq", "grill", "grilling"],
  bbq: ["barbecue", "grill"],
  fishing: ["fish", "angler", "rod"],
};

/** Simple English plurals → singular for dictionary lookup. */
function singularizeToken(token: string): string {
  if (token.length < 4) return token;
  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.endsWith("ses") || token.endsWith("xes") || token.endsWith("zes")) {
    return token.slice(0, -2);
  }
  if (token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
}

function addSynonymsForKey(key: string, terms: Set<string>) {
  const syns = VISUAL_SYNONYMS[key];
  if (!syns) return;
  terms.add(key);
  for (const s of syns) terms.add(s);
}

/**
 * Expand a visual query into searchable tokens (original + synonyms + words).
 */
export function expandVisualQueryTerms(query: string): string[] {
  const base = normalizeVisionToken(query);
  if (!base) return [];

  const terms = new Set<string>();
  terms.add(base);

  const singularBase = singularizeToken(base);
  if (singularBase !== base) terms.add(singularBase);

  // Multi-word phrase synonyms
  for (const [key, syns] of Object.entries(VISUAL_SYNONYMS)) {
    if (base.includes(key) || key.includes(base) || singularBase === key) {
      terms.add(key);
      for (const s of syns) terms.add(s);
    }
  }

  // Individual words (skip ultra-short)
  for (const word of base.split(/\s+/)) {
    if (word.length < 3) continue;
    terms.add(word);
    const singular = singularizeToken(word);
    if (singular !== word) terms.add(singular);
    addSynonymsForKey(word, terms);
    addSynonymsForKey(singular, terms);
  }

  return [...terms].slice(0, 36);
}

/**
 * Score how well a media row's visual fields match expanded terms.
 * Higher is better. Exact object/scene hits outweigh caption substrings.
 */
export function scoreVisualMatch(
  terms: string[],
  fields: {
    caption?: string | null;
    description?: string | null;
    tags?: string[] | null;
    objects?: string[] | null;
    scenes?: string[] | null;
    filename?: string | null;
  },
): number {
  if (terms.length === 0) return 0;

  const objects = (fields.objects ?? []).map((t) =>
    normalizeVisionToken(String(t)),
  );
  const scenes = (fields.scenes ?? []).map((t) =>
    normalizeVisionToken(String(t)),
  );
  const tags = (fields.tags ?? []).map((t) => normalizeVisionToken(String(t)));

  const bag = [
    ...tags,
    ...objects,
    ...scenes,
    fields.caption ?? "",
    fields.description ?? "",
    fields.filename ?? "",
  ]
    .map((t) => normalizeVisionToken(String(t)))
    .filter(Boolean)
    .join(" | ");

  if (!bag) return 0;

  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    if (objects.some((o) => o === term || o.includes(term))) {
      score += Math.min(12, 4 + Math.floor(term.length / 3));
      continue;
    }
    if (scenes.some((s) => s === term || s.includes(term))) {
      score += Math.min(11, 3 + Math.floor(term.length / 3));
      continue;
    }
    if (tags.some((t) => t === term || t.includes(term))) {
      score += Math.min(9, 2 + Math.floor(term.length / 4));
      continue;
    }
    if (bag.includes(term)) {
      score += Math.min(6, 1 + Math.floor(term.length / 5));
    }
  }
  return score;
}

/** Helpful alternatives when a visual search returns nothing. */
export function suggestVisualAlternatives(query: string): string[] {
  const terms = expandVisualQueryTerms(query);
  const suggestions: string[] = [];
  const base = normalizeVisionToken(query);
  for (const t of terms) {
    if (t === base) continue;
    if (t.split(/\s+/).length <= 3) {
      suggestions.push(`try “${t}”`);
    }
    if (suggestions.length >= 4) break;
  }
  if (suggestions.length === 0) {
    suggestions.push("try a simpler object word (cake, beach, dog, suit, tie)");
    suggestions.push("try a scene word (indoors, outdoors, beach, party, office)");
  }
  return suggestions;
}

/** Exposed for tests / intent helpers. */
export function listVisualSynonymKeys(): string[] {
  return Object.keys(VISUAL_SYNONYMS);
}
