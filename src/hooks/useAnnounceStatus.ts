"use client";

import { useEffect, useRef } from "react";
import { announce, type AnnouncePriority } from "@/lib/a11y/announce";

/**
 * Announce whenever a status / notice / error string becomes non-empty.
 * Skips empty clears so we don't spam on dismiss.
 */
export function useAnnounceStatus(
  message: string | null | undefined,
  options?: { priority?: AnnouncePriority; dedupeMs?: number },
) {
  const priority = options?.priority ?? "polite";
  const dedupeMs = options?.dedupeMs;
  const prev = useRef<string | null>(null);

  useEffect(() => {
    const next = message?.trim() || null;
    if (!next) {
      prev.current = null;
      return;
    }
    if (next === prev.current) return;
    prev.current = next;
    announce(next, { priority, dedupeMs });
  }, [message, priority, dedupeMs]);
}
