/**
 * Disambiguate person-name candidates vs common object/scene vocabulary.
 *
 * Priority:
 * 1. High-confidence People match → person
 * 2. Common object/scene lexicon / visual taxonomy → visual
 * 3. "photos of <words>" when words are not a known person → visual first
 * 4. "Who did you mean?" only for likely person intent with multiple similar matches
 */

import { isCommonObjectOrSceneTerm } from "@/lib/ai/visual-lexicon";

export type TokenRoute =
  | "person"
  | "object"
  | "scene"
  | "visual"
  | "ambiguous_person"
  | "unknown";

export type DisambiguateCandidateInput = {
  candidate: string;
  prompt: string;
  /** Account People display names. */
  knownPeople?: string[];
  /** When true, candidate matched multiple catalog people. */
  ambiguousPersonMatch?: boolean;
  /** When true, candidate matched exactly one catalog person. */
  exactPersonMatch?: boolean;
};

export type DisambiguateCandidateResult = {
  route: TokenRoute;
  /** Prefer visual search over person clarify/not-found. */
  preferVisual: boolean;
  /** Ask which person (ambiguous matches only). */
  askWhoDidYouMean: boolean;
  reason: string;
};

const KINSHIP =
  /^(grandpa|grandma|grandfather|grandmother|papa|mama|mom|dad|mother|father|uncle|aunt|brother|sister|cousin|nana|papa|daddy|mommy)$/i;

const PERSON_CUE =
  /\b(?:my|our|his|her|their)\s+(?:mom|dad|mother|father|grandpa|grandma|uncle|aunt|brother|sister|cousin|son|daughter|husband|wife|friend)\b/i;

function stripArticle(value: string): string {
  return value.replace(/^(?:a|an|the)\s+/i, "").trim();
}

function normalize(value: string): string {
  return stripArticle(value).toLowerCase().replace(/[^\p{L}\p{M}\s'-]/gu, "").trim();
}

function namesLooselyMatch(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (left === right) return true;
  if (right.includes(left) || left.includes(right)) return true;
  const leftFirst = left.split(/\s+/)[0]!;
  const rightFirst = right.split(/\s+/)[0]!;
  return leftFirst.length > 2 && leftFirst === rightFirst;
}

export function matchKnownPersonName(
  candidate: string,
  knownPeople: string[] | undefined,
): string | null {
  if (!knownPeople?.length) return null;
  const cleaned = normalize(candidate);
  if (!cleaned) return null;
  const hit = knownPeople.find((known) => namesLooselyMatch(cleaned, known));
  return hit ?? null;
}

/** "photos of X" / "pictures of X" / "images with X" capture. */
export function extractPhotosOfPhrase(prompt: string): string | null {
  const match = prompt.match(
    /\b(?:photos?|pictures?|pics?|images?|videos?)\s+(?:of|with|showing|containing)\s+(.+?)(?:\s+from\s+|\s+in\s+\d{4}|[.?!]|$)/i,
  );
  if (!match?.[1]) return null;
  return match[1].trim().replace(/[?.!,;:]+$/, "");
}

export function looksLikeLikelyPersonName(candidate: string): boolean {
  const raw = candidate.trim();
  const cleaned = normalize(raw);
  if (!cleaned) return false;
  if (isCommonObjectOrSceneTerm(cleaned)) return false;
  if (KINSHIP.test(cleaned)) return true;
  // Capitalized given name / first+last
  if (/^[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?$/.test(raw)) return true;
  // Lowercase single token that isn't a common noun — weak person signal
  if (/^[a-z]{3,}$/.test(cleaned) && !isCommonObjectOrSceneTerm(cleaned)) {
    return true;
  }
  return false;
}

/**
 * Route one candidate token/phrase for Ask AI search.
 */
export function disambiguatePeopleVsVisual(
  input: DisambiguateCandidateInput,
): DisambiguateCandidateResult {
  const cleaned = normalize(input.candidate);
  const knownHit =
    input.exactPersonMatch || matchKnownPersonName(input.candidate, input.knownPeople);

  // 1) High-confidence People match
  if (knownHit && !input.ambiguousPersonMatch) {
    return {
      route: "person",
      preferVisual: false,
      askWhoDidYouMean: false,
      reason: "matched_known_person",
    };
  }

  // Ambiguous people (multiple similar matches)
  if (input.ambiguousPersonMatch) {
    return {
      route: "ambiguous_person",
      preferVisual: false,
      askWhoDidYouMean: true,
      reason: "multiple_similar_people",
    };
  }

  // Article + noun ("a toilet") → always visual
  if (/^(?:a|an|the)\s+/i.test(input.candidate.trim())) {
    return {
      route: "object",
      preferVisual: true,
      askWhoDidYouMean: false,
      reason: "article_object_phrase",
    };
  }

  // 2) Common object/scene vocabulary
  if (isCommonObjectOrSceneTerm(cleaned) || isCommonObjectOrSceneTerm(input.candidate)) {
    const sceneLike =
      /\b(beach|indoor|indoors|outdoor|outdoors|kitchen|bathroom|party|wedding|park|office|home|school)\b/i.test(
        cleaned,
      );
    return {
      route: sceneLike ? "scene" : "object",
      preferVisual: true,
      askWhoDidYouMean: false,
      reason: "common_object_scene_lexicon",
    };
  }

  // Kinship / strong person cues — before photos-of-unknown (Grandpa is a person ask).
  if (KINSHIP.test(cleaned) || PERSON_CUE.test(input.prompt)) {
    return {
      route: "person",
      preferVisual: false,
      askWhoDidYouMean: false,
      reason: "person_cue",
    };
  }

  // 3) "photos of <words>" and words are not a known person → visual first.
  // Only when a People catalog is present (otherwise every name is "unknown").
  const photosOf = extractPhotosOfPhrase(input.prompt);
  if (photosOf && input.knownPeople && input.knownPeople.length > 0) {
    const photosOfNorm = normalize(photosOf);
    const candidateInPhotosOf =
      photosOfNorm === cleaned ||
      photosOfNorm.includes(cleaned) ||
      cleaned.includes(photosOfNorm);
    const photosOfKnown = matchKnownPersonName(photosOf, input.knownPeople);
    if (candidateInPhotosOf && !photosOfKnown) {
      return {
        route: "visual",
        preferVisual: true,
        askWhoDidYouMean: false,
        reason: "photos_of_unknown_try_visual_first",
      };
    }
  }

  if (looksLikeLikelyPersonName(input.candidate)) {
    return {
      route: "person",
      preferVisual: false,
      askWhoDidYouMean: false,
      reason: "likely_person_name",
    };
  }

  // Default: prefer visual over inventing a person miss for odd nouns
  return {
    route: "visual",
    preferVisual: true,
    askWhoDidYouMean: false,
    reason: "default_visual",
  };
}

/** True when clarification should ask which person (ambiguous only). */
export function shouldAskWhoDidYouMean(input: {
  personIntentLikely: boolean;
  ambiguousPersonMatch: boolean;
  isNormalObject: boolean;
}): boolean {
  if (input.isNormalObject) return false;
  return input.personIntentLikely && input.ambiguousPersonMatch;
}
