/**
 * Transition catalog for UI / settings — no sharp / Node deps.
 * Renderers live in transitions.ts (server-only).
 */

import type { MovieTransition } from "@/lib/movies/settings";

export type TransitionCatalogEntry = {
  id: MovieTransition;
  label: string;
  hint: string;
  /** Suggested duration when theme does not override. */
  defaultDurationMs: number;
};

/** UI + docs catalog — every style users can pick in Create Movie. */
export const TRANSITION_CATALOG: readonly TransitionCatalogEntry[] = [
  {
    id: "crossfade",
    label: "Crossfade",
    hint: "Smooth linear-light blend",
    defaultDurationMs: 550,
  },
  {
    id: "soft_dissolve",
    label: "Soft dissolve",
    hint: "Gentle blend with soft mid bloom",
    defaultDurationMs: 900,
  },
  {
    id: "soft_cut",
    label: "Soft cut",
    hint: "Brief soften",
    defaultDurationMs: 220,
  },
  {
    id: "fade",
    label: "Fade through black",
    hint: "Dip to black, then rise",
    defaultDurationMs: 700,
  },
  {
    id: "fade_white",
    label: "Fade through white",
    hint: "Bright dip, then rise",
    defaultDurationMs: 650,
  },
  {
    id: "slide",
    label: "Slide left",
    hint: "Incoming from right",
    defaultDurationMs: 500,
  },
  {
    id: "slide_right",
    label: "Slide right",
    hint: "Incoming from left",
    defaultDurationMs: 500,
  },
  {
    id: "push",
    label: "Gentle push",
    hint: "Both frames move",
    defaultDurationMs: 550,
  },
  {
    id: "zoom_through",
    label: "Zoom through",
    hint: "Push in / settle",
    defaultDurationMs: 700,
  },
  {
    id: "blur_dissolve",
    label: "Blur dissolve",
    hint: "Soft focus blend",
    defaultDurationMs: 650,
  },
  {
    id: "light_leak",
    label: "Light leak wipe",
    hint: "Warm wipe",
    defaultDurationMs: 700,
  },
  {
    id: "none",
    label: "Hard cut",
    hint: "No transition",
    defaultDurationMs: 0,
  },
] as const;

const CATALOG_BY_ID = Object.fromEntries(
  TRANSITION_CATALOG.map((e) => [e.id, e]),
) as Record<MovieTransition, TransitionCatalogEntry>;

export function getTransitionCatalogEntry(
  style: MovieTransition,
): TransitionCatalogEntry {
  return CATALOG_BY_ID[style] ?? CATALOG_BY_ID.crossfade;
}
