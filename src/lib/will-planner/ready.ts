/**
 * High-level next steps after generating an attorney planning draft.
 */

import { US_STATE_OPTIONS } from "@/lib/will-planner/questions";

export type WillReadyLink = {
  label: string;
  href: string;
};

export function willReadyStateLabel(stateCode: string | null | undefined): string {
  if (!stateCode?.trim()) return "your state";
  return (
    US_STATE_OPTIONS.find((s) => s.value === stateCode)?.label ?? stateCode
  );
}

export function buildWillReadyChecklist(stateCode: string | null | undefined): string[] {
  const state = willReadyStateLabel(stateCode);
  return [
    "Read the draft",
    "Store secrets in Digital Legacy / Private Documents (passwords, crypto location, business how-to) — not in the will",
    `Find a licensed attorney in ${state}`,
    "Ask them to turn this into an executable will (and trust/POA if they recommend)",
    "Sign with required witnesses",
    "Tell the executor where the original is",
    "Revisit after marriage, divorce, birth, home purchase, or business change",
  ];
}

/** Calm deep links into Digital Legacy — no mid-flow upsell. */
export const WILL_READY_LEGACY_LINKS: WillReadyLink[] = [
  {
    label: "Key contacts",
    href: "/documents/legacy/contacts",
  },
  {
    label: "Practical instructions",
    href: "/documents/legacy/practical",
  },
  {
    label: "Secure items",
    href: "/documents/legacy/secure",
  },
  {
    label: "Private Documents",
    href: "/documents",
  },
  {
    label: "Emergency access",
    href: "/documents/legacy/emergency",
  },
];
