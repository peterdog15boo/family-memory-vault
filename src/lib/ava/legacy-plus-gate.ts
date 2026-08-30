/**
 * Ava Legacy+ upgrade cards (Documents / Digital Legacy / Will planner).
 *
 * Dismiss (“Maybe later” / X) is per tab session so the blocking card does
 * not reopen immediately. A new tab may show it once again.
 */

import type { AvaProgress, AvaStep, AvaStepId } from "@/lib/ava/types";

export const AVA_LEGACY_PLUS_GATE_STEPS = [
  "documents_legacy",
  "will_planner",
] as const;

export type AvaLegacyPlusGateStepId =
  (typeof AVA_LEGACY_PLUS_GATE_STEPS)[number];

export const AVA_LEGACY_PLUS_GATE_STORAGE_KEY = "fmv.ava.legacyPlusGates";

export function isAvaLegacyPlusGateStep(
  id: string | null | undefined,
): id is AvaLegacyPlusGateStepId {
  return (
    id === "documents_legacy" ||
    id === "will_planner"
  );
}

/** Where to send the user after a successful beta plan switch. */
export function featureHrefForLegacyPlusGate(
  id: AvaLegacyPlusGateStepId,
): string {
  return id === "will_planner" ? "/legacy/will" : "/documents";
}

export function readDismissedLegacyPlusGates(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(
      AVA_LEGACY_PLUS_GATE_STORAGE_KEY,
    );
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((value): value is string => typeof value === "string"),
    );
  } catch {
    return new Set();
  }
}

export function persistDismissedLegacyPlusGate(id: string): void {
  if (typeof window === "undefined") return;
  if (!isAvaLegacyPlusGateStep(id)) return;
  const next = readDismissedLegacyPlusGates();
  next.add(id);
  try {
    window.sessionStorage.setItem(
      AVA_LEGACY_PLUS_GATE_STORAGE_KEY,
      JSON.stringify([...next]),
    );
  } catch {
    // quota / private mode — in-memory Set in the caller still applies
  }
}

export function isLegacyPlusGateDismissedThisSession(
  id: string,
  dismissed: Set<string> = readDismissedLegacyPlusGates(),
): boolean {
  return isAvaLegacyPlusGateStep(id) && dismissed.has(id);
}

/**
 * Step to show in the Ava card. Skips Legacy+ upgrade cards dismissed
 * this tab session so header-open does not force the same blocking prompt.
 */
export function pickDisplayedAvaStep(
  progress: AvaProgress,
  dismissed: Set<string> = readDismissedLegacyPlusGates(),
): AvaStep | null {
  const steps = progress.steps ?? [];
  const visible = progress.visibleSteps ?? steps.filter((s) => s.status !== "locked");

  const preferred =
    steps.find((s) => s.id === progress.activeStepId) ??
    visible.find((s) => s.status === "active") ??
    visible.find((s) => s.status === "available") ??
    null;

  if (
    preferred &&
    !isLegacyPlusGateDismissedThisSession(preferred.id, dismissed)
  ) {
    return preferred;
  }

  return (
    visible.find(
      (s) =>
        (s.status === "available" || s.status === "active") &&
        !isLegacyPlusGateDismissedThisSession(s.id, dismissed),
    ) ?? null
  );
}

export function isAvaSkipViaApiStep(id: AvaStepId): boolean {
  return (
    id === "encourage_memory" ||
    id === "create_memory" ||
    id === "people" ||
    id === "create_movie" ||
    id === "ask_ai" ||
    id === "invite"
  );
}
