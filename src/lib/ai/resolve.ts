/**
 * Resolve parsed assistant intent against the current user's vault data.
 *
 * Precision over aggressive guessing:
 * - People are matched only within `userId`'s `people` rows
 * - Ambiguous name matches return candidates for clarification (never pick arbitrarily)
 * - Time phrases become concrete ISO ranges when confident; otherwise keep the label
 * - School-grade ranges use an optional birth year when available later
 *
 * Examples:
 *   people: ["Noah"] + catalog [{ id: "p1", name: "Noah Roberts" }]
 *   → peopleIds: ["p1"]
 *
 *   people: ["Alex"] + catalog [Alex Smith, Alex Jones]
 *   → unresolved (ambiguous) + candidates
 *
 *   date_range.label: "last summer" (now = Jul 2026)
 *   → { start: "2025-06-01", end: "2025-08-31", isConcrete: true }
 *
 *   date_range.label: "7th grade" without birth year
 *   → label kept, isConcrete: false, clarification suggested
 */

import {
  disambiguatePeopleVsVisual,
  shouldAskWhoDidYouMean,
} from "@/lib/ai/disambiguate";
import { isFalsePersonCandidate } from "@/lib/ai/intent";
import { isCommonObjectOrSceneTerm } from "@/lib/ai/visual-lexicon";
import { listPeopleForUser } from "@/lib/people";
import type { AssistantDateRange, AssistantIntent } from "@/lib/assistant/types";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

export type PersonCatalogEntry = {
  id: string;
  name: string;
};

export type PersonMatchCandidate = {
  id: string;
  name: string;
  /** 0–1 similarity; higher is better. */
  score: number;
};

export type MatchedPerson = {
  id: string;
  name: string;
  /** Original name fragment from the intent. */
  matchedOn: string;
  score: number;
};

export type UnresolvedPerson = {
  query: string;
  reason: "not_found" | "ambiguous";
  candidates: PersonMatchCandidate[];
};

/**
 * Concrete (or partially resolved) date window for media filters.
 * Dates are ISO `YYYY-MM-DD` when present.
 */
export type DateFilter = {
  label?: string;
  start?: string;
  end?: string;
  /** True when start + end are set and safe to use as a query filter. */
  isConcrete: boolean;
  /**
   * Why the filter is incomplete (e.g. grade without birth year).
   * Useful for clarification copy.
   */
  resolutionNote?: string;
};

export type ResolvedIntent = {
  intent: AssistantIntent;
  /** Deduped person IDs confidently matched. */
  peopleIds: string[];
  matchedPeople: MatchedPerson[];
  unresolvedPeople: UnresolvedPerson[];
  dateFilter: DateFilter | null;
  needsClarification: boolean;
  clarifyingQuestions: string[];
};

export type ResolveIntentOptions = {
  now?: Date;
  /** Inject catalog for tests; otherwise loaded via listPeopleForUser(userId). */
  peopleCatalog?: PersonCatalogEntry[];
  /**
   * Optional birth years keyed by person id (not stored on `people` yet).
   * Enables best-effort school-grade → calendar range mapping.
   */
  birthYearByPersonId?: Record<string, number>;
  /**
   * Typical age at the start of kindergarten / grade 0 (US default: 5).
   * Grade N school year ≈ birthYear + kindergartenStartAge + N.
   */
  kindergartenStartAge?: number;
};

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Resolve intent people + time references against the current user's data only.
 */
export async function resolveIntent(
  userId: string,
  intent: AssistantIntent,
  options: ResolveIntentOptions = {},
): Promise<ResolvedIntent> {
  const catalog =
    options.peopleCatalog ??
    (await listPeopleForUser(userId)).map((person) => ({
      id: person.id,
      name: person.name,
    }));

  return resolveIntentWithCatalog(intent, catalog, options);
}

/**
 * Pure resolver (no DB) — preferred for unit tests.
 */
export function resolveIntentWithCatalog(
  intent: AssistantIntent,
  catalog: PersonCatalogEntry[],
  options: ResolveIntentOptions = {},
): ResolvedIntent {
  const now = options.now ?? new Date();
  const knownPeople = catalog.map((entry) => entry.name);

  // Drop object/scene false positives before People matching / not-found copy.
  const realPeopleQueries: string[] = [];
  const demotedVisual: string[] = [];
  for (const name of intent.people) {
    if (isFalsePersonCandidate(name, intent.raw_prompt, knownPeople)) {
      const stem = singularizePersonNoun(name);
      if (stem) demotedVisual.push(stem);
      continue;
    }
    realPeopleQueries.push(name);
  }

  const peopleResult = resolvePeopleNames(realPeopleQueries, catalog);

  // Unmatched ordinary nouns / photos-of-unknown → demote to visual, never person miss.
  // Keep ambiguous matches for "which person?" clarify only.
  const keptUnresolved: typeof peopleResult.unresolved = [];
  const visualFromUnresolved: string[] = [];
  for (const unresolved of peopleResult.unresolved) {
    if (unresolved.reason === "ambiguous") {
      const ask = shouldAskWhoDidYouMean({
        personIntentLikely: true,
        ambiguousPersonMatch: true,
        isNormalObject: isCommonObjectOrSceneTerm(unresolved.query),
      });
      if (ask) {
        keptUnresolved.push(unresolved);
      } else {
        const stem = singularizePersonNoun(unresolved.query);
        if (stem) visualFromUnresolved.push(stem);
      }
      continue;
    }

    const routed = disambiguatePeopleVsVisual({
      candidate: unresolved.query,
      prompt: intent.raw_prompt,
      knownPeople,
      exactPersonMatch: false,
    });
    if (
      unresolved.reason === "not_found" &&
      (routed.preferVisual ||
        isFalsePersonCandidate(
          unresolved.query,
          intent.raw_prompt,
          knownPeople,
        ))
    ) {
      const stem = singularizePersonNoun(unresolved.query);
      if (stem) visualFromUnresolved.push(stem);
      continue;
    }

    // Soft not-found without "Who did you mean?" — only keep when person intent
    // is strong and not a photos-of visual-first ask.
    if (unresolved.reason === "not_found" && routed.route === "person") {
      keptUnresolved.push(unresolved);
      continue;
    }

    const stem = singularizePersonNoun(unresolved.query);
    if (stem) visualFromUnresolved.push(stem);
  }

  const filteredPeopleResult = {
    matched: peopleResult.matched,
    unresolved: keptUnresolved,
  };

  const dateFilter = resolveDateReference(intent.date_range, {
    now,
    matchedPeople: filteredPeopleResult.matched,
    birthYearByPersonId: options.birthYearByPersonId,
    kindergartenStartAge: options.kindergartenStartAge ?? 5,
  });

  const clarifyingQuestions = buildResolveClarifications({
    intent,
    peopleResult: filteredPeopleResult,
    dateFilter,
  });

  const foldedVisual = uniqueStrings([
    ...demotedVisual,
    ...visualFromUnresolved,
  ]);
  const nextIntent: AssistantIntent =
    foldedVisual.length > 0
      ? {
          ...intent,
          people: filteredPeopleResult.matched.map((p) => p.name),
          objects: uniqueStrings([...(intent.objects ?? []), ...foldedVisual]),
          qualities: uniqueStrings([
            ...(intent.qualities ?? []),
            ...foldedVisual,
          ]),
          visual_query:
            intent.visual_query?.trim() || foldedVisual.join(" ") || undefined,
          action:
            intent.action === "clarify" &&
            filteredPeopleResult.unresolved.length === 0
              ? "search_media"
              : intent.action,
          clarifying_questions:
            filteredPeopleResult.unresolved.length === 0
              ? undefined
              : intent.clarifying_questions,
        }
      : {
          ...intent,
          people:
            realPeopleQueries.length !== intent.people.length
              ? filteredPeopleResult.matched.length > 0
                ? filteredPeopleResult.matched.map((p) => p.name)
                : realPeopleQueries
              : intent.people,
        };

  const needsClarification =
    (nextIntent.action === "clarify" &&
      filteredPeopleResult.unresolved.length > 0) ||
    filteredPeopleResult.unresolved.length > 0 ||
    clarifyingQuestions.length > 0 ||
    Boolean(dateFilter?.resolutionNote && !dateFilter.isConcrete);

  return {
    intent: nextIntent,
    peopleIds: filteredPeopleResult.matched.map((p) => p.id),
    matchedPeople: filteredPeopleResult.matched,
    unresolvedPeople: filteredPeopleResult.unresolved,
    dateFilter,
    needsClarification,
    clarifyingQuestions: uniqueStrings([
      ...(nextIntent.clarifying_questions ?? []),
      ...clarifyingQuestions,
    ]),
  };
}

function singularizePersonNoun(value: string): string {
  const stripped = value
    .trim()
    .toLowerCase()
    .replace(/^(?:a|an|the)\s+/i, "");
  if (stripped.length > 3 && stripped.endsWith("s") && !stripped.endsWith("ss")) {
    return stripped.slice(0, -1);
  }
  return stripped;
}

/* -------------------------------------------------------------------------- */
/* People matching                                                             */
/* -------------------------------------------------------------------------- */

export type ResolvePeopleResult = {
  matched: MatchedPerson[];
  unresolved: UnresolvedPerson[];
};

/**
 * Match intent name fragments to catalog entries.
 * Prefers exact / unique partial matches; returns ambiguous candidates otherwise.
 */
export function resolvePeopleNames(
  queries: string[],
  catalog: PersonCatalogEntry[],
): ResolvePeopleResult {
  const matched: MatchedPerson[] = [];
  const unresolved: UnresolvedPerson[] = [];
  const claimedIds = new Set<string>();

  for (const rawQuery of queries) {
    const query = rawQuery.trim();
    if (!query) continue;

    const ranked = rankPersonMatches(query, catalog).filter(
      (candidate) => !claimedIds.has(candidate.id),
    );

    if (ranked.length === 0) {
      unresolved.push({ query, reason: "not_found", candidates: [] });
      continue;
    }

    const best = ranked[0]!;
    const second = ranked[1];
    const isClearWinner =
      best.score >= MIN_ACCEPT_SCORE &&
      (!second || best.score - second.score >= MIN_SCORE_GAP || second.score < MIN_ACCEPT_SCORE);

    if (isClearWinner) {
      matched.push({
        id: best.id,
        name: best.name,
        matchedOn: query,
        score: best.score,
      });
      claimedIds.add(best.id);
      continue;
    }

    // Ambiguous: return top candidates for clarification (do not guess).
    unresolved.push({
      query,
      reason: "ambiguous",
      candidates: ranked.slice(0, 5),
    });
  }

  return { matched, unresolved };
}

const MIN_ACCEPT_SCORE = 0.72;
/** Require a clear margin before auto-selecting when multiple candidates score well. */
const MIN_SCORE_GAP = 0.12;

export function rankPersonMatches(
  query: string,
  catalog: PersonCatalogEntry[],
): PersonMatchCandidate[] {
  const normalizedQuery = normalizeName(query);
  if (!normalizedQuery) return [];

  const scored: PersonMatchCandidate[] = [];

  for (const person of catalog) {
    const score = scoreNameMatch(normalizedQuery, normalizeName(person.name));
    if (score >= MIN_ACCEPT_SCORE) {
      scored.push({ id: person.id, name: person.name, score });
    }
  }

  return scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

function scoreNameMatch(query: string, candidate: string): number {
  if (!query || !candidate) return 0;
  if (query === candidate) return 1;

  const queryTokens = query.split(/\s+/).filter(Boolean);
  const candidateTokens = candidate.split(/\s+/).filter(Boolean);

  // Exact first-name match against a multi-word person name.
  if (
    queryTokens.length === 1 &&
    candidateTokens[0] === queryTokens[0] &&
    queryTokens[0]!.length >= 2
  ) {
    return 0.93;
  }

  // Exact token equality anywhere (e.g. query "Roberts" vs "Noah Roberts").
  if (
    queryTokens.length === 1 &&
    candidateTokens.some((token) => token === queryTokens[0])
  ) {
    return queryTokens[0]!.length >= 4 ? 0.88 : 0.7;
  }

  // Candidate starts with query ("Noa" → "Noah") — only reasonably long prefixes.
  if (query.length >= 3 && candidate.startsWith(query)) {
    return 0.8 + Math.min(0.15, query.length / candidate.length / 2);
  }

  // Query is a contiguous substring of the full name ("noah rob" in "noah roberts").
  if (query.length >= 4 && candidate.includes(query)) {
    return 0.78;
  }

  // All query tokens appear in candidate tokens (order-agnostic).
  if (
    queryTokens.length > 1 &&
    queryTokens.every((qt) =>
      candidateTokens.some((ct) => ct === qt || (qt.length >= 3 && ct.startsWith(qt))),
    )
  ) {
    return 0.9;
  }

  // Single-edit typo tolerance for first names (length ≥ 4 only).
  if (queryTokens.length === 1 && candidateTokens[0]) {
    const first = candidateTokens[0];
    if (query.length >= 4 && first.length >= 4) {
      const distance = levenshtein(query, first);
      if (distance === 1) return 0.76;
      if (distance === 2 && query.length >= 6) return 0.72;
    }
  }

  return 0;
}

function normalizeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (curr[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j] ?? 0;
  }
  return prev[b.length] ?? 0;
}

/* -------------------------------------------------------------------------- */
/* Date resolution                                                             */
/* -------------------------------------------------------------------------- */

export type ResolveDateOptions = {
  now?: Date;
  matchedPeople?: MatchedPerson[];
  birthYearByPersonId?: Record<string, number>;
  kindergartenStartAge?: number;
};

/**
 * Turn an intent date_range into a concrete filter when possible.
 */
export function resolveDateReference(
  range: AssistantDateRange | undefined,
  options: ResolveDateOptions = {},
): DateFilter | null {
  if (!range) return null;

  const now = options.now ?? new Date();
  const label = range.label?.trim();
  const existingStart = normalizeIsoDate(range.start);
  const existingEnd = normalizeIsoDate(range.end);

  // Prefer already-concrete ISO bounds from the parser when valid.
  if (existingStart && existingEnd && existingStart <= existingEnd) {
    return {
      label: label || undefined,
      start: existingStart,
      end: existingEnd,
      isConcrete: true,
    };
  }

  if (label) {
    const fromLabel = resolveDateLabel(label, {
      now,
      matchedPeople: options.matchedPeople,
      birthYearByPersonId: options.birthYearByPersonId,
      kindergartenStartAge: options.kindergartenStartAge ?? 5,
    });
    if (fromLabel) return fromLabel;
  }

  if (existingStart || existingEnd || label) {
    return {
      label: label || undefined,
      start: existingStart,
      end: existingEnd,
      isConcrete: Boolean(existingStart && existingEnd),
      resolutionNote:
        existingStart && existingEnd
          ? undefined
          : "Could not fully resolve this time reference into a date range.",
    };
  }

  return null;
}

function resolveDateLabel(
  label: string,
  options: {
    now: Date;
    matchedPeople?: MatchedPerson[];
    birthYearByPersonId?: Record<string, number>;
    kindergartenStartAge: number;
  },
): DateFilter | null {
  const lower = label.toLowerCase().trim();

  const grade = lower.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+grade$/);
  if (grade) {
    return resolveSchoolGrade(Number(grade[1]), options);
  }

  if (lower === "last summer") {
    const year =
      options.now.getUTCMonth() >= 8
        ? options.now.getUTCFullYear()
        : options.now.getUTCFullYear() - 1;
    return concrete(`last summer`, `${year}-06-01`, `${year}-08-31`);
  }

  if (lower === "this summer") {
    const year = options.now.getUTCFullYear();
    return concrete(`this summer`, `${year}-06-01`, `${year}-08-31`);
  }

  if (lower === "last winter") {
    // Prior Dec–Feb window ending in the current/most recent winter.
    const endYear =
      options.now.getUTCMonth() >= 2
        ? options.now.getUTCFullYear()
        : options.now.getUTCFullYear() - 1;
    return concrete(`last winter`, `${endYear - 1}-12-01`, `${endYear}-02-28`);
  }

  if (lower === "last year") {
    const year = options.now.getUTCFullYear() - 1;
    return concrete(`last year`, `${year}-01-01`, `${year}-12-31`);
  }

  if (lower === "this year") {
    const year = options.now.getUTCFullYear();
    return concrete(`this year`, `${year}-01-01`, `${year}-12-31`);
  }

  const christmasYear = lower.match(/^christmas\s+(20\d{2}|19\d{2})$/);
  if (christmasYear) {
    const year = christmasYear[1]!;
    return concrete(`Christmas ${year}`, `${year}-12-01`, `${year}-12-31`);
  }

  if (lower === "christmas") {
    const year = options.now.getUTCFullYear();
    return {
      label: "Christmas",
      start: `${year}-12-01`,
      end: `${year}-12-31`,
      isConcrete: true,
      resolutionNote:
        "Interpreted as the current calendar year's December; say “Christmas 2024” for a specific year.",
    };
  }

  const yearOnly = lower.match(/^(20\d{2}|19\d{2})$/);
  if (yearOnly) {
    const year = yearOnly[1]!;
    return concrete(year, `${year}-01-01`, `${year}-12-31`);
  }

  return {
    label,
    isConcrete: false,
    resolutionNote: `Unrecognized time reference “${label}”.`,
  };
}

function resolveSchoolGrade(
  grade: number,
  options: {
    matchedPeople?: MatchedPerson[];
    birthYearByPersonId?: Record<string, number>;
    kindergartenStartAge: number;
  },
): DateFilter {
  const label = `${ordinal(grade)} grade`;

  if (grade < 0 || grade > 12) {
    return {
      label,
      isConcrete: false,
      resolutionNote: `Grade ${grade} is outside the supported K–12 range.`,
    };
  }

  const birthYears = (options.matchedPeople ?? [])
    .map((person) => options.birthYearByPersonId?.[person.id])
    .filter((year): year is number => typeof year === "number" && year > 1900);

  const uniqueBirthYears = [...new Set(birthYears)];

  if (uniqueBirthYears.length === 1) {
    const birthYear = uniqueBirthYears[0]!;
    const schoolYearStart =
      birthYear + options.kindergartenStartAge + grade;
    return {
      label,
      start: `${schoolYearStart}-08-01`,
      end: `${schoolYearStart + 1}-06-30`,
      isConcrete: true,
      resolutionNote: `Estimated from birth year ${birthYear} (kindergarten start age ${options.kindergartenStartAge}).`,
    };
  }

  if (uniqueBirthYears.length > 1) {
    return {
      label,
      isConcrete: false,
      resolutionNote:
        "Multiple matched people have different birth years, so this grade cannot be mapped to one date range.",
    };
  }

  return {
    label,
    isConcrete: false,
    resolutionNote:
      "School-grade dates need a birth year for the person. Add one later or specify a calendar year.",
  };
}

function concrete(label: string, start: string, end: string): DateFilter {
  return { label, start, end, isConcrete: true };
}

function normalizeIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

function ordinal(n: number): string {
  const suffix =
    n % 10 === 1 && n % 100 !== 11
      ? "st"
      : n % 10 === 2 && n % 100 !== 12
        ? "nd"
        : n % 10 === 3 && n % 100 !== 13
          ? "rd"
          : "th";
  return `${n}${suffix}`;
}

/* -------------------------------------------------------------------------- */
/* Clarification copy                                                          */
/* -------------------------------------------------------------------------- */

function buildResolveClarifications(input: {
  intent: AssistantIntent;
  peopleResult: ResolvePeopleResult;
  dateFilter: DateFilter | null;
}): string[] {
  const questions: string[] = [];

  for (const unresolved of input.peopleResult.unresolved) {
    if (unresolved.reason === "not_found") {
      questions.push(
        `I couldn’t find anyone named ${unresolved.query} in People.`,
      );
      questions.push(
        "Check People for the right spelling or nickname, or manually assign faces from People or the media viewer.",
      );
      continue;
    }

    const names = unresolved.candidates.map((c) => c.name).join(", ");
    questions.push(
      `“${unresolved.query}” matches more than one person (${names}). Which one should I use?`,
    );
  }

  if (input.dateFilter && !input.dateFilter.isConcrete && input.dateFilter.label) {
    if (/grade/i.test(input.dateFilter.label)) {
      questions.push(
        `What calendar years cover “${input.dateFilter.label}” for this person? (Birth year support will make this automatic later.)`,
      );
    } else if (input.dateFilter.resolutionNote) {
      questions.push(
        `Can you clarify the time period for “${input.dateFilter.label}”?`,
      );
    }
  }

  return questions;
}

function uniqueStrings(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (!out.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
      out.push(trimmed);
    }
  }
  return out;
}
