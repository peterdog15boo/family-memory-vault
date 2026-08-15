"use client";

import { useEffect, useRef } from "react";
import {
  pickAskAiGreeting,
  sanitizeSpeechName,
} from "@/lib/assistant/greetings";
import {
  ASK_AI_GREETING_PREF_EVENT,
  cancelAskAiGreeting,
  getAskAiRobotGreetingsEnabled,
  getLastAskAiGreetingId,
  rememberAskAiGreetingId,
  setAskAiRobotGreetingsEnabled,
  shouldPlayAskAiGreetingOnOpen,
  speakAskAiGreeting,
} from "@/lib/assistant/speak-greeting";

/**
 * Occasionally play one short Ask AI robot greeting when the panel opens
 * (~1 in 5–6 opens). Honors Settings preference (default ON).
 */
export function useAskAiOpenGreeting(
  open: boolean,
  rawName?: string | null,
) {
  const wasOpen = useRef(false);
  const enabledRef = useRef(true);

  // Load preference + listen for Settings changes (immediate honor).
  useEffect(() => {
    enabledRef.current = getAskAiRobotGreetingsEnabled();

    let cancelled = false;
    async function loadPref() {
      try {
        const res = await fetch("/api/settings/account");
        if (!res.ok) return;
        const data = (await res.json()) as {
          preferences?: { askAiRobotGreetingsEnabled?: boolean };
        };
        if (
          !cancelled &&
          typeof data.preferences?.askAiRobotGreetingsEnabled === "boolean"
        ) {
          setAskAiRobotGreetingsEnabled(
            data.preferences.askAiRobotGreetingsEnabled,
          );
          enabledRef.current = data.preferences.askAiRobotGreetingsEnabled;
          if (!data.preferences.askAiRobotGreetingsEnabled) {
            cancelAskAiGreeting();
          }
        }
      } catch {
        /* keep default ON */
      }
    }
    void loadPref();

    function onPref(e: Event) {
      const enabled = (e as CustomEvent<{ enabled?: boolean }>).detail
        ?.enabled;
      if (typeof enabled !== "boolean") return;
      setAskAiRobotGreetingsEnabled(enabled);
      enabledRef.current = enabled;
      if (!enabled) cancelAskAiGreeting();
    }
    window.addEventListener(ASK_AI_GREETING_PREF_EVENT, onPref);
    return () => {
      cancelled = true;
      window.removeEventListener(ASK_AI_GREETING_PREF_EVENT, onPref);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      if (wasOpen.current) {
        cancelAskAiGreeting();
      }
      wasOpen.current = false;
      return;
    }

    if (wasOpen.current) return;
    wasOpen.current = true;

    if (!shouldPlayAskAiGreetingOnOpen(enabledRef.current)) {
      return;
    }

    const name = sanitizeSpeechName(rawName);
    const lastId = getLastAskAiGreetingId();
    const picked = pickAskAiGreeting(name, lastId);
    rememberAskAiGreetingId(picked.id);

    const timer = window.setTimeout(() => {
      if (!enabledRef.current) return;
      speakAskAiGreeting(picked.text);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [open, rawName]);
}
