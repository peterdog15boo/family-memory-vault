/**
 * Speak an Ask AI open greeting via Web Speech API.
 * Fails soft when speech/autoplay is unavailable or blocked.
 */

export const ASK_AI_GREETING_PREF_EVENT = "fmv:ask-ai-greeting-pref";

/** ~1 in 5.5 opens when greetings are enabled. */
export const ASK_AI_GREETING_OPEN_CHANCE = 1 / 5.5;

let lastGreetingId: string | null = null;
let speaking = false;
/** Cached preference — default ON until Settings says otherwise. */
let greetingsEnabled = true;

const LAST_ID_KEY = "fmv-ask-ai-last-greeting-id";
const PREF_KEY = "fmv-ask-ai-greetings-enabled";

function readLastId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(LAST_ID_KEY);
  } catch {
    return lastGreetingId;
  }
}

function writeLastId(id: string) {
  lastGreetingId = id;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(LAST_ID_KEY, id);
  } catch {
    /* private mode */
  }
}

function readStoredPref(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw === "0" || raw === "false") return false;
    if (raw === "1" || raw === "true") return true;
  } catch {
    /* ignore */
  }
  return null;
}

function writeStoredPref(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PREF_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Apply Settings preference (and mirror locally for fast reopen). */
export function setAskAiRobotGreetingsEnabled(enabled: boolean) {
  greetingsEnabled = enabled;
  writeStoredPref(enabled);
}

export function getAskAiRobotGreetingsEnabled(): boolean {
  const stored = readStoredPref();
  if (typeof stored === "boolean") {
    greetingsEnabled = stored;
    return stored;
  }
  return greetingsEnabled;
}

/**
 * Decide whether this panel open should greet.
 * Requires preference ON and a ~1-in-5.5 random chance.
 */
export function shouldPlayAskAiGreetingOnOpen(
  enabled: boolean = getAskAiRobotGreetingsEnabled(),
  random: () => number = Math.random,
): boolean {
  if (!enabled) return false;
  return random() < ASK_AI_GREETING_OPEN_CHANCE;
}

export function getLastAskAiGreetingId(): string | null {
  return readLastId() ?? lastGreetingId;
}

export function rememberAskAiGreetingId(id: string) {
  writeLastId(id);
}

/** Cancel any in-flight Ask AI greeting. */
export function cancelAskAiGreeting() {
  if (typeof window === "undefined") return;
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
  speaking = false;
}

/**
 * Speak a short greeting at subtle volume.
 * No-ops when the tab is hidden or speech is unsupported.
 */
export function speakAskAiGreeting(text: string): void {
  if (typeof window === "undefined") return;
  const line = text.replace(/\s+/g, " ").trim();
  if (!line) return;
  if (document.visibilityState === "hidden") return;
  if (!getAskAiRobotGreetingsEnabled()) return;

  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined") return;

  try {
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(line);
    utter.volume = 0.62;
    utter.rate = 1.06;
    utter.pitch = 1.12;
    utter.lang =
      document.documentElement.lang?.trim() ||
      navigator.language ||
      "en-US";

    const voices = synth.getVoices?.() ?? [];
    const preferred =
      voices.find(
        (v) =>
          /en(-|_|$)/i.test(v.lang) &&
          /google|samantha|karen|moira|female|natural/i.test(v.name),
      ) ||
      voices.find((v) => /en(-|_|$)/i.test(v.lang)) ||
      null;
    if (preferred) utter.voice = preferred;

    utter.onend = () => {
      speaking = false;
    };
    utter.onerror = () => {
      speaking = false;
    };

    speaking = true;
    synth.speak(utter);

    if (voices.length === 0 && typeof synth.addEventListener === "function") {
      const onVoices = () => {
        synth.removeEventListener("voiceschanged", onVoices);
        if (!speaking) return;
        try {
          const refreshed = synth.getVoices();
          const next =
            refreshed.find((v) => /en(-|_|$)/i.test(v.lang)) || null;
          if (next && !utter.voice) {
            synth.cancel();
            utter.voice = next;
            synth.speak(utter);
          }
        } catch {
          speaking = false;
        }
      };
      synth.addEventListener("voiceschanged", onVoices);
    }
  } catch {
    speaking = false;
  }
}

/** Test helper */
export function __resetAskAiGreetingSpeechForTests() {
  lastGreetingId = null;
  speaking = false;
  greetingsEnabled = true;
}
