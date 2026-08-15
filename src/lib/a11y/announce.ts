/**
 * Site-wide screen reader announcements via aria-live regions.
 * Invisible to sighted users; no layout or theme impact.
 */

export type AnnouncePriority = "polite" | "assertive";

export type AnnounceOptions = {
  /** Default: polite. Use assertive only for urgent errors / timeouts. */
  priority?: AnnouncePriority;
  /**
   * Skip identical messages within this window (ms).
   * Default 900 — avoids rapid-fire duplicates for the same event.
   */
  dedupeMs?: number;
};

type LiveRegionNodes = {
  polite: HTMLElement;
  assertive: HTMLElement;
};

const DEFAULT_DEDUPE_MS = 900;

let regions: LiveRegionNodes | null = null;
let lastMessage = "";
let lastAt = 0;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

/** Called by LiveAnnouncer once the hidden regions mount. */
export function registerLiveRegions(next: LiveRegionNodes | null) {
  regions = next;
}

function normalizeMessage(message: string): string {
  return message.replace(/\s+/g, " ").trim();
}

/**
 * Announce a short status message to assistive technology.
 * Prefer completed actions and important status changes — not keystrokes.
 */
export function announce(message: string, options: AnnounceOptions = {}): void {
  if (typeof window === "undefined") return;

  const text = normalizeMessage(message);
  if (!text) return;

  const priority = options.priority ?? "polite";
  const dedupeMs = options.dedupeMs ?? DEFAULT_DEDUPE_MS;
  const now = Date.now();

  if (text === lastMessage && now - lastAt < dedupeMs) {
    return;
  }
  lastMessage = text;
  lastAt = now;

  const node = regions?.[priority];
  if (!node) {
    // Regions not mounted yet — queue a microtask retry once.
    queueMicrotask(() => {
      const retry = regions?.[priority];
      if (!retry) return;
      writeAnnouncement(retry, text);
    });
    return;
  }

  writeAnnouncement(node, text);
}

function writeAnnouncement(node: HTMLElement, text: string) {
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }

  // Clearing then setting lets the same phrase be spoken again after dedupe.
  node.textContent = "";
  // Force a reflow so AT notices the change even for identical strings later.
  void node.offsetHeight;
  node.textContent = text;

  clearTimer = setTimeout(() => {
    if (node.textContent === text) {
      node.textContent = "";
    }
    clearTimer = null;
  }, 8_000);
}

/** Test helper — reset module state between vitest cases. */
export function __resetAnnounceForTests() {
  lastMessage = "";
  lastAt = 0;
  if (clearTimer) {
    clearTimeout(clearTimer);
    clearTimer = null;
  }
}
