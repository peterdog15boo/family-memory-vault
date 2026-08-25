import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isFirstFamilyMovieLocalPreviewEnabled,
  isFirstFamilyMovieLocalPreviewRequest,
  isFirstFamilyMovieOnboardingEnabled,
} from "@/lib/first-family-movie/flags";

describe("first-family-movie flags", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads server or public onboarding flags", () => {
    vi.stubEnv("FIRST_FAMILY_MOVIE_ONBOARDING", "");
    vi.stubEnv("NEXT_PUBLIC_FIRST_FAMILY_MOVIE_ONBOARDING", "true");
    expect(isFirstFamilyMovieOnboardingEnabled()).toBe(true);

    vi.stubEnv("NEXT_PUBLIC_FIRST_FAMILY_MOVIE_ONBOARDING", "");
    vi.stubEnv("FIRST_FAMILY_MOVIE_ONBOARDING", "true");
    expect(isFirstFamilyMovieOnboardingEnabled()).toBe(true);

    vi.stubEnv("FIRST_FAMILY_MOVIE_ONBOARDING", "");
    vi.stubEnv("NEXT_PUBLIC_FIRST_FAMILY_MOVIE_ONBOARDING", "");
    expect(isFirstFamilyMovieOnboardingEnabled()).toBe(false);
  });

  it("allows local preview in development or on localhost host", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isFirstFamilyMovieLocalPreviewEnabled()).toBe(true);
    expect(
      isFirstFamilyMovieLocalPreviewRequest({ preview: "1" }),
    ).toBe(true);
    expect(
      isFirstFamilyMovieLocalPreviewRequest({ preview: undefined }),
    ).toBe(false);
    expect(
      isFirstFamilyMovieLocalPreviewRequest({
        pathname: "/first-family-movie/preview",
      }),
    ).toBe(true);
    expect(
      isFirstFamilyMovieLocalPreviewRequest({ search: "?preview=1" }),
    ).toBe(true);

    vi.stubEnv("NODE_ENV", "production");
    expect(isFirstFamilyMovieLocalPreviewEnabled()).toBe(false);
    expect(
      isFirstFamilyMovieLocalPreviewRequest({ preview: "1" }),
    ).toBe(false);
    expect(isFirstFamilyMovieLocalPreviewEnabled("localhost:3000")).toBe(
      true,
    );
    expect(
      isFirstFamilyMovieLocalPreviewRequest({
        preview: "1",
        host: "localhost:3000",
      }),
    ).toBe(true);
  });
});
