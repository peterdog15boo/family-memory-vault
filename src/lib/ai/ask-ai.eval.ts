/**
 * Ask AI evaluation set — golden prompts for routing + acceptance checks.
 *
 * Run: `npm test -- src/lib/ai/ask-ai.eval.test.ts`
 */

export type AskAiEvalBucket =
  | "object_or_scene"
  | "person"
  | "mixed"
  | "help";

export type AskAiEvalCase = {
  id: string;
  prompt: string;
  expected: AskAiEvalBucket;
  /** Substrings that should appear in visual fields for object/scene/mixed. */
  visualHints?: string[];
  /** Person name substrings expected for person/mixed. */
  peopleHints?: string[];
};

/** Canonical Ask AI routing evaluation cases. */
export const ASK_AI_EVAL_CASES: AskAiEvalCase[] = [
  // Object / scene
  {
    id: "toilet",
    prompt: "show me photos of a toilet",
    expected: "object_or_scene",
    visualHints: ["toilet"],
  },
  {
    id: "cakes",
    prompt: "show me photos of cakes",
    expected: "object_or_scene",
    visualHints: ["cake"],
  },
  {
    id: "beach",
    prompt: "show me beach photos",
    expected: "object_or_scene",
    visualHints: ["beach"],
  },
  {
    id: "indoors",
    prompt: "show me photos taken indoors",
    expected: "object_or_scene",
    visualHints: ["indoor"],
  },
  {
    id: "dogs",
    prompt: "show me dogs",
    expected: "object_or_scene",
    visualHints: ["dog"],
  },
  {
    id: "cars",
    prompt: "show me cars",
    expected: "object_or_scene",
    visualHints: ["car"],
  },
  {
    id: "suits_ties",
    prompt: "show me suits and ties",
    expected: "object_or_scene",
    visualHints: ["suit", "tie"],
  },

  // Person
  {
    id: "scott",
    prompt: "show me photos of Scott",
    expected: "person",
    peopleHints: ["scott"],
  },
  {
    id: "mom",
    prompt: "show me pictures of Mom",
    expected: "person",
    peopleHints: ["mom"],
  },
  {
    id: "jeff",
    prompt: "find Jeff",
    expected: "person",
    peopleHints: ["jeff"],
  },

  // Mixed
  {
    id: "scott_beach",
    prompt: "Scott at the beach",
    expected: "mixed",
    peopleHints: ["scott"],
    visualHints: ["beach"],
  },
  {
    id: "kids_birthday",
    prompt: "kids at a birthday party",
    expected: "mixed",
    visualHints: ["kid", "party"],
  },

  // Help
  {
    id: "invite_family",
    prompt: "how do I invite family members?",
    expected: "help",
  },
  {
    id: "more_movies",
    prompt: "how can I make more movies per month?",
    expected: "help",
  },
];

/** Account People catalog used by the eval harness. */
export const ASK_AI_EVAL_KNOWN_PEOPLE = [
  "Scott",
  "Jeff",
  "Mom",
  "Noah Roberts",
];

export const ASK_AI_EVAL_PERSON_CATALOG = [
  { id: "scott", name: "Scott" },
  { id: "jeff", name: "Jeff" },
  { id: "mom", name: "Mom" },
  { id: "noah", name: "Noah Roberts" },
];
