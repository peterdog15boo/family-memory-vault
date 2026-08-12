/**
 * Client celebration events — calm, one-at-a-time, older-relative friendly.
 */

import type { JourneyTrackKind } from "@/lib/gamification/types";

export type CelebrationPresentation = "micro" | "full";

export type CelebrationEffects = {
  confetti: boolean;
  badgeReveal: boolean;
  lpCount: boolean;
  sound: boolean;
};

export type CelebrationEvent = {
  id: string;
  /** Dedupes optimistic UI vs polling the same unlock. */
  fingerprint: string;
  track: JourneyTrackKind;
  presentation: CelebrationPresentation;
  title: string;
  body?: string;
  lpGained: number;
  previousLevel: number;
  newLevel: number;
  nextGoal: { title: string; lpReward: number } | null;
  effects: CelebrationEffects;
  notificationId?: string;
};

export const CELEBRATION_EVENT = "fmv-celebrate";
export const CELEBRATION_SOUND_PREF_EVENT = "fmv:celebration-sound-pref";
