/**
 * Ask AI panel open greetings — short, playful, robot personality.
 */

export type AskAiGreeting = {
  id: string;
  /** Template with optional `{name}` placeholder. */
  withName?: string;
  withoutName: string;
};

/** Mix of personalized + generic lines. Keep short for speech. */
export const ASK_AI_GREETINGS: AskAiGreeting[] = [
  {
    id: "what-could-go-wrong",
    withName: "Hey {name}, ask the AI — what could go wrong?",
    withoutName: "Ask the AI, what could go wrong?",
  },
  {
    id: "beep-hello",
    withName: "Beep beep beep. Hello, {name}.",
    withoutName: "Beep beep beep.",
  },
  {
    id: "zero-coffee",
    withName: "{name}, I brought answers. And zero coffee.",
    withoutName: "I brought answers. And zero coffee.",
  },
  {
    id: "ready",
    withName: "Ready when you are, {name}.",
    withoutName: "Ready when you are.",
  },
  {
    id: "find-photos",
    withName: "Let’s find those photos, {name}.",
    withoutName: "Let’s find those photos.",
  },
  {
    id: "practicing",
    withName: "Ask away, {name}. I’ve been practicing.",
    withoutName: "Ask away. I’ve been practicing.",
  },
  {
    id: "robot-online",
    withoutName: "Robot online. Curiosity encouraged.",
  },
  {
    id: "beep-boop",
    withoutName: "Beep. Boop. Brilliant question incoming?",
  },
  {
    id: "circuits-warm",
    withName: "Circuits warm, {name}. What’s on your mind?",
    withoutName: "Circuits warm. What’s on your mind?",
  },
  {
    id: "memory-detective",
    withName: "{name}, your friendly memory detective reporting for duty.",
    withoutName: "Friendly memory detective, reporting for duty.",
  },
  {
    id: "no-judging",
    withoutName: "No judgment. Only search results… mostly.",
  },
  {
    id: "standby",
    withName: "Standing by, {name}.",
    withoutName: "Standing by.",
  },
];

const MAX_SPEECH_NAME_LEN = 24;

/**
 * Prefer a short first/screen name safe for speech synthesis.
 * Returns null when nothing usable is available.
 */
export function sanitizeSpeechName(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  let name = raw.trim();
  if (!name) return null;
  if (name.includes("@") || /https?:\/\//i.test(name)) return null;

  // Prefer first token of a full display name ("Jeff Roberts" → "Jeff").
  const first = name.split(/\s+/)[0] ?? name;
  name = first;

  name = name
    .replace(/[<>{}[\]\\|/#$%^*=+]+/g, "")
    .replace(/[^\p{L}\p{N}'’\- ]/gu, "")
    .trim();

  if (name.length < 2) return null;
  if (name.length > MAX_SPEECH_NAME_LEN) {
    name = name.slice(0, MAX_SPEECH_NAME_LEN).trim();
  }
  return name || null;
}

export function interpolateGreetingName(
  template: string,
  name: string | null,
): string {
  if (!name) {
    return template.replace(/\{name\}/gi, "").replace(/\s{2,}/g, " ").trim();
  }
  return template.replace(/\{name\}/gi, name).replace(/\s{2,}/g, " ").trim();
}

export function buildAskAiGreetingText(
  greeting: AskAiGreeting,
  name: string | null,
): string {
  if (name && greeting.withName) {
    return interpolateGreetingName(greeting.withName, name);
  }
  return greeting.withoutName;
}

/**
 * Pick a random greeting, avoiding the previous id when possible.
 * Roughly half personalized when a name is available.
 */
export function pickAskAiGreeting(
  name: string | null,
  lastId: string | null = null,
): { id: string; text: string } {
  const preferNamed = Boolean(name) && Math.random() < 0.55;
  let pool = preferNamed
    ? ASK_AI_GREETINGS.filter((g) => g.withName)
    : ASK_AI_GREETINGS;

  if (pool.length === 0) pool = ASK_AI_GREETINGS;

  let candidates = lastId
    ? pool.filter((g) => g.id !== lastId)
    : pool;
  if (candidates.length === 0) candidates = pool;

  const chosen =
    candidates[Math.floor(Math.random() * candidates.length)] ??
    ASK_AI_GREETINGS[0]!;

  return {
    id: chosen.id,
    text: buildAskAiGreetingText(chosen, name),
  };
}
