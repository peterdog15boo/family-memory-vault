/**
 * Synonym expansion + visual search helpers for Ask AI.
 *
 * Expands everyday concepts (objects, settings, people categories) so
 * retrieval matches related ai_tags / user_tags / ai_objects / ai_scenes labels.
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
  beach: ["ocean", "shore", "shoreline", "sand", "seaside", "coast"],
  shore: ["beach", "ocean", "sand", "shoreline", "coast"],
  // Bathroom / fixtures
  toilet: ["bathroom", "restroom", "washroom", "lavatory", "wc", "toilets"],
  toilets: ["toilet", "bathroom", "restroom", "washroom"],
  bathroom: ["toilet", "restroom", "washroom", "bath", "shower", "sink"],
  restroom: ["toilet", "bathroom", "washroom", "lavatory", "wc"],
  washroom: ["bathroom", "restroom", "toilet"],
  lavatory: ["toilet", "bathroom", "restroom"],
  wc: ["toilet", "bathroom", "restroom"],
  // Multilingual bathroom / toilet
  inodoro: ["toilet", "bathroom", "restroom", "washroom", "wc"],
  inodoros: ["toilet", "bathroom", "restroom", "wc"],
  bano: ["bathroom", "toilet", "restroom", "bath", "shower", "washroom"],
  banos: ["bathroom", "toilet", "restroom", "bath"],
  toilettes: ["toilet", "bathroom", "restroom", "wc"],
  toilette: ["toilet", "bathroom", "restroom"],
  badezimmer: ["bathroom", "toilet", "restroom", "bath"],
  klo: ["toilet", "bathroom", "restroom", "wc"],
  kitchen: ["cooking", "stove", "oven", "counter", "kitchenette"],
  // Multilingual aliases → English vision labels (stored captions/tags are English)
  playa: ["beach", "ocean", "shore", "sand", "coast", "seaside"],
  playas: ["beach", "ocean", "shore", "sand", "coast"],
  plage: ["beach", "ocean", "shore", "sand", "coast"],
  strand: ["beach", "ocean", "shore", "sand", "coast"],
  spiaggia: ["beach", "ocean", "shore", "sand", "coast"],
  praia: ["beach", "ocean", "shore", "sand", "coast"],
  海滩: ["beach", "ocean", "shore", "sand"],
  ビーチ: ["beach", "ocean", "shore", "sand"],
  바다: ["beach", "ocean", "sea", "shore"],
  mer: ["ocean", "sea", "beach", "water"],
  mare: ["ocean", "sea", "beach", "water"],
  mar: ["ocean", "sea", "beach", "water"],
  costa: ["beach", "coast", "shore", "ocean"],
  // Accented forms normalize to ASCII keys via normalizeVisionToken
  cumpleanos: ["birthday", "cake", "party", "celebration"],
  anniversaire: ["birthday", "cake", "party", "celebration"],
  geburtstag: ["birthday", "cake", "party", "celebration"],
  compleanno: ["birthday", "cake", "party", "celebration"],
  aniversario: ["birthday", "cake", "party", "celebration"],
  生日: ["birthday", "cake", "party"],
  誕生日: ["birthday", "cake", "party"],
  생일: ["birthday", "cake", "party"],
  pastel: ["cake", "birthday cake", "dessert"],
  gateau: ["cake", "birthday cake", "dessert"],
  torte: ["cake", "birthday cake", "dessert"],
  bolo: ["cake", "birthday cake", "dessert"],
  tarta: ["cake", "birthday cake", "dessert"],
  tarte: ["cake", "birthday cake", "dessert", "pie"],
  boda: ["wedding", "bride", "groom", "ceremony"],
  mariage: ["wedding", "bride", "groom", "ceremony"],
  hochzeit: ["wedding", "bride", "groom", "ceremony"],
  matrimonio: ["wedding", "bride", "groom", "ceremony"],
  casamento: ["wedding", "bride", "groom", "ceremony"],
  婚礼: ["wedding", "bride", "groom"],
  結婚式: ["wedding", "bride", "groom"],
  결혼식: ["wedding", "bride", "groom"],
  perro: ["dog", "puppy", "pet"],
  chien: ["dog", "puppy", "pet"],
  hund: ["dog", "puppy", "pet"],
  cane: ["dog", "puppy", "pet"],
  cachorro: ["dog", "puppy", "pet"],
  狗: ["dog", "puppy", "pet"],
  犬: ["dog", "puppy", "pet"],
  개: ["dog", "puppy", "pet"],
  gato: ["cat", "kitten", "pet"],
  chat: ["cat", "kitten", "pet"],
  katze: ["cat", "kitten", "pet"],
  gatto: ["cat", "kitten", "pet"],
  猫: ["cat", "kitten", "pet"],
  고양이: ["cat", "kitten", "pet"],
  // Vehicles (multilingual)
  voiture: ["car", "cars", "automobile", "vehicle"],
  voitures: ["car", "cars", "automobile", "vehicle"],
  coche: ["car", "cars", "automobile", "vehicle"],
  coches: ["car", "cars", "automobile", "vehicle"],
  auto: ["car", "cars", "automobile", "vehicle"],
  autos: ["car", "cars", "automobile", "vehicle"],
  wagen: ["car", "cars", "automobile", "vehicle"],
  macchina: ["car", "cars", "automobile", "vehicle"],
  carro: ["car", "cars", "automobile", "vehicle"],
  车: ["car", "cars", "automobile", "vehicle"],
  車: ["car", "cars", "automobile", "vehicle"],
  자동차: ["car", "cars", "automobile", "vehicle"],
  piscina: ["pool", "swimming pool", "swim"],
  piscine: ["pool", "swimming pool", "swim"],
  schwimmbad: ["pool", "swimming pool", "swim"],
  泳池: ["pool", "swimming pool"],
  プール: ["pool", "swimming pool"],
  수영장: ["pool", "swimming pool"],
  parque: ["park", "playground"],
  parc: ["park", "playground"],
  park: ["park", "playground"],
  parco: ["park", "playground"],
  公园: ["park", "playground"],
  公園: ["park", "playground"],
  공원: ["park", "playground"],
  interior: ["indoor", "indoors", "inside"],
  interieur: ["indoor", "indoors", "inside"],
  innen: ["indoor", "indoors", "inside"],
  interno: ["indoor", "indoors", "inside"],
  室内: ["indoor", "indoors", "inside"],
  屋内: ["indoor", "indoors", "inside"],
  실내: ["indoor", "indoors", "inside"],
  exterior: ["outdoor", "outdoors", "outside"],
  exterieur: ["outdoor", "outdoors", "outside"],
  aussen: ["outdoor", "outdoors", "outside"],
  außen: ["outdoor", "outdoors", "outside"],
  esterno: ["outdoor", "outdoors", "outside"],
  户外: ["outdoor", "outdoors", "outside"],
  屋外: ["outdoor", "outdoors", "outside"],
  야외: ["outdoor", "outdoors", "outside"],
  shoreline: ["beach", "shore", "ocean", "sand"],
  ocean: ["beach", "sea", "water", "shore"],
  sand: ["beach", "shore"],
  indoor: ["indoors", "inside", "interior", "indoor scene"],
  indoors: ["indoor", "inside", "interior"],
  inside: ["indoor", "indoors", "interior"],
  outdoor: ["outdoors", "outside", "exterior", "outdoor scene"],
  outdoors: ["outdoor", "outside", "exterior"],
  outside: ["outdoor", "outdoors", "exterior"],
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
 * Multilingual words (e.g. inodoro, playa, voiture) expand to English AI tags.
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

  return [...terms].slice(0, 48);
}

/**
 * Build retrieval terms from the user utterance + any English-normalized hints.
 * Keeps original-language tokens and expands them onto English AI labels.
 */
export function buildVisualSearchTerms(
  ...parts: Array<string | null | undefined>
): string[] {
  const joined = parts
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join(" ");
  return expandVisualQueryTerms(joined);
}

/**
 * Score how well a media row's visual fields match expanded terms.
 * Higher is better. Exact object/scene/user-tag hits outweigh caption substrings.
 * Primary query terms (original ask) score higher than synonym expansions.
 *
 * User tags are first-class: a manual “toilet” tag ranks like an AI object hit
 * so Ask AI / Photos search recall works when vision missed the label.
 */
export function scoreVisualMatch(
  terms: string[],
  fields: {
    caption?: string | null;
    description?: string | null;
    tags?: string[] | null;
    /** Manual keywords — ranked with object-level weight. */
    userTags?: string[] | null;
    objects?: string[] | null;
    scenes?: string[] | null;
    filename?: string | null;
  },
  options?: {
    /** Original query terms — boosted over synonym-only hits. */
    primaryTerms?: string[];
  },
): number {
  if (terms.length === 0) return 0;

  const primary = new Set(
    (options?.primaryTerms ?? [])
      .map((t) => normalizeVisionToken(String(t)))
      .filter(Boolean),
  );

  const objects = (fields.objects ?? []).map((t) =>
    normalizeVisionToken(String(t)),
  );
  const scenes = (fields.scenes ?? []).map((t) =>
    normalizeVisionToken(String(t)),
  );
  const userTags = (fields.userTags ?? []).map((t) =>
    normalizeVisionToken(String(t)),
  );
  const tags = (fields.tags ?? []).map((t) => normalizeVisionToken(String(t)));

  const bag = [
    ...userTags,
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
    const boost = primary.has(term) || [...primary].some((p) => p.includes(term) || term.includes(p))
      ? 1.75
      : 1;
    // Manual tags first — intentional signal equal to AI objects.
    if (userTags.some((t) => t === term || t.includes(term))) {
      score += Math.round(Math.min(12, 4 + Math.floor(term.length / 3)) * boost);
      continue;
    }
    if (objects.some((o) => o === term || o.includes(term))) {
      score += Math.round(Math.min(12, 4 + Math.floor(term.length / 3)) * boost);
      continue;
    }
    if (scenes.some((s) => s === term || s.includes(term))) {
      score += Math.round(Math.min(11, 3 + Math.floor(term.length / 3)) * boost);
      continue;
    }
    if (tags.some((t) => t === term || t.includes(term))) {
      score += Math.round(Math.min(9, 2 + Math.floor(term.length / 4)) * boost);
      continue;
    }
    if (bag.includes(term)) {
      score += Math.round(Math.min(6, 1 + Math.floor(term.length / 5)) * boost);
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
    suggestions.push("try a simpler object word (cake, beach, dog, toilet, suit)");
    suggestions.push("try a scene word (indoors, outdoors, beach, kitchen, bathroom, party)");
  }
  return suggestions;
}

/** Exposed for tests / intent helpers. */
export function listVisualSynonymKeys(): string[] {
  return Object.keys(VISUAL_SYNONYMS);
}
