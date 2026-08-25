import { describe, expect, it } from "vitest";
import {
  FIRST_MOVIE_FUNNEL_EVENTS,
  isFirstMovieFunnelEvent,
} from "@/lib/first-family-movie/funnel";

describe("first movie funnel events", () => {
  it("includes the full conversion ladder", () => {
    expect(FIRST_MOVIE_FUNNEL_EVENTS).toEqual([
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
    ]);
  });

  it("validates known event names", () => {
    expect(isFirstMovieFunnelEvent("first_movie_welcome_viewed")).toBe(true);
    expect(isFirstMovieFunnelEvent("not_a_real_event")).toBe(false);
  });
});
