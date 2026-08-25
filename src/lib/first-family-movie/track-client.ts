/**
 * Client-side First Family Movie funnel tracking.
 * Best-effort — never blocks UX.
 */

import type {
  FirstMovieFunnelEvent,
  FirstMovieFunnelProps,
} from "@/lib/first-family-movie/funnel";

/** Fire-and-forget funnel event (authenticated). */
export function trackFirstMovieEvent(
  event: FirstMovieFunnelEvent,
  props?: FirstMovieFunnelProps,
): void {
  try {
    void fetch("/api/first-family-movie", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "track",
        event,
        ...(props && Object.keys(props).length > 0 ? { props } : {}),
      }),
      keepalive: true,
    }).catch(() => {
      // ignore network errors
    });
  } catch {
    // ignore
  }
}
