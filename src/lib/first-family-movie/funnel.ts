/**
 * First Family Movie funnel event names — stable for conversion analysis.
 * Client-safe (no Node / DB imports).
 */

export const FIRST_MOVIE_FUNNEL_EVENTS = [
  "first_movie_welcome_viewed",
  "first_movie_upload_started",
  "first_movie_upload_reached_5",
  "first_movie_create_clicked",
  "first_movie_render_started",
  "first_movie_render_completed",
  "first_movie_watched",
  "first_movie_person_named",
  "first_movie_add_more_clicked",
  "first_movie_invite_clicked",
  "first_movie_completed",
] as const;

export type FirstMovieFunnelEvent = (typeof FIRST_MOVIE_FUNNEL_EVENTS)[number];

const EVENT_SET = new Set<string>(FIRST_MOVIE_FUNNEL_EVENTS);

export function isFirstMovieFunnelEvent(
  value: string,
): value is FirstMovieFunnelEvent {
  return EVENT_SET.has(value);
}

export type FirstMovieFunnelProps = Record<
  string,
  string | number | boolean | null | undefined
>;
