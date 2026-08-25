import { describe, expect, it } from "vitest";
import { evaluateFirstFamilyMovieEligibility } from "@/lib/first-family-movie/gate";

describe("evaluateFirstFamilyMovieEligibility", () => {
  it("stays off when the feature flag is disabled", () => {
    expect(
      evaluateFirstFamilyMovieEligibility({
        flagOn: false,
        complete: false,
        eligibleNewUser: true,
        mediaCount: 0,
        movieCount: 0,
      }).shouldEnter,
    ).toBe(false);
  });

  it("sends new empty vaults into the ritual when the flag is on", () => {
    expect(
      evaluateFirstFamilyMovieEligibility({
        flagOn: true,
        complete: false,
        eligibleNewUser: true,
        mediaCount: 0,
        movieCount: 0,
      }).shouldEnter,
    ).toBe(true);
  });

  it("keeps eligible new users in the ritual after they upload photos", () => {
    expect(
      evaluateFirstFamilyMovieEligibility({
        flagOn: true,
        complete: false,
        eligibleNewUser: true,
        mediaCount: 5,
        movieCount: 0,
      }).shouldEnter,
    ).toBe(true);
  });

  it("never re-enters after completion", () => {
    expect(
      evaluateFirstFamilyMovieEligibility({
        flagOn: true,
        complete: true,
        eligibleNewUser: true,
        mediaCount: 0,
        movieCount: 0,
      }).shouldEnter,
    ).toBe(false);
  });

  it("resumes when a first movie is ready but the reveal was missed", () => {
    const result = evaluateFirstFamilyMovieEligibility({
      flagOn: true,
      complete: false,
      eligibleNewUser: true,
      mediaCount: 5,
      movieCount: 1,
      firstFamilyMovieId: "movie_abc",
      revealSeen: false,
    });
    expect(result.shouldEnter).toBe(true);
    expect(result.pendingRevealMovieId).toBe("movie_abc");
  });

  it("does not force users who already had movies outside the ritual", () => {
    expect(
      evaluateFirstFamilyMovieEligibility({
        flagOn: true,
        complete: false,
        eligibleNewUser: true,
        mediaCount: 0,
        movieCount: 1,
      }).shouldEnter,
    ).toBe(false);
  });

  it("skips legacy accounts that were never marked eligible", () => {
    expect(
      evaluateFirstFamilyMovieEligibility({
        flagOn: true,
        complete: false,
        eligibleNewUser: false,
        mediaCount: 0,
        movieCount: 0,
      }).shouldEnter,
    ).toBe(false);
  });
});
