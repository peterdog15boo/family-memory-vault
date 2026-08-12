/**
 * Optimistic celebration dispatch — safe to call from any client handler.
 */

import { mapJourneyCelebration } from "@/lib/celebrations/map-journey";
import {
  CELEBRATION_EVENT,
  type CelebrationEvent,
} from "@/lib/celebrations/types";
import type { JourneyCelebrationPayload } from "@/lib/gamification/types";

export function celebrate(event: CelebrationEvent): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CELEBRATION_EVENT, { detail: event }));
}

export function celebrateFromJourney(
  payload: JourneyCelebrationPayload,
  id?: string,
): void {
  const eventId =
    id ??
    `optimistic:${payload.track}:${payload.achievements[0]?.id ?? payload.newLevel}:${payload.lpGained}`;
  celebrate(mapJourneyCelebration(payload, eventId));
}

export function onCelebrate(
  handler: (event: CelebrationEvent) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  function onEvent(raw: Event) {
    const detail = (raw as CustomEvent<CelebrationEvent>).detail;
    if (!detail?.id) return;
    handler(detail);
  }
  window.addEventListener(CELEBRATION_EVENT, onEvent);
  return () => window.removeEventListener(CELEBRATION_EVENT, onEvent);
}
