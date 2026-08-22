import { describe, expect, it } from "vitest";
import {
  FREE_PLAN,
  getCatalogPlan,
  PLAN_CATALOG,
} from "@/lib/plans/catalog";
import {
  assertGateAllowed,
  isAdvancedMovieTheme,
  PlanGateError,
  type PlanGateResult,
} from "@/lib/plans/gates";
import type { PlanLimits } from "@/lib/plans";

const freeLimits: PlanLimits = {
  slug: FREE_PLAN.slug,
  name: FREE_PLAN.name,
  storageLimitBytes: FREE_PLAN.storageLimitBytes,
  maxFamilyMembers: FREE_PLAN.maxFamilyMembers,
  maxMoviesPerMonth: FREE_PLAN.maxMoviesPerMonth,
  maxActiveMovieJobs: FREE_PLAN.maxActiveMovieJobs,
  features: FREE_PLAN.features,
};

describe("getCatalogPlan", () => {
  it("returns known plans by slug", () => {
    expect(getCatalogPlan("free").slug).toBe("free");
    expect(getCatalogPlan("family").slug).toBe("family");
    expect(getCatalogPlan("family_plus").slug).toBe("family_plus");
  });

  it("falls back to Free for unknown slugs", () => {
    // @ts-expect-error intentional bad slug
    expect(getCatalogPlan("nope").slug).toBe("free");
  });

  it("keeps Free plan limits conservative", () => {
    expect(FREE_PLAN.storageLimitBytes).toBe(5 * 1024 ** 3);
    expect(FREE_PLAN.maxMoviesPerMonth).toBe(5);
    expect(FREE_PLAN.features.familySharing).toBe(false);
    expect(FREE_PLAN.features.cinematicThemes).toBe(false);
    expect(FREE_PLAN.features.aiSoundtrack).toBe(false);
  });

  it("enables family sharing on paid Family plan", () => {
    const family = PLAN_CATALOG.find((p) => p.slug === "family")!;
    expect(family.features.familySharing).toBe(true);
    expect(family.features.cinematicThemes).toBe(true);
    expect(family.features.aiSoundtrack).toBe(true);
  });

  it("gates Legacy+ vault tools on the legacy plan only", () => {
    const legacy = PLAN_CATALOG.find((p) => p.slug === "legacy")!;
    const free = PLAN_CATALOG.find((p) => p.slug === "free")!;
    const family = PLAN_CATALOG.find((p) => p.slug === "family")!;
    expect(legacy.name).toBe("Legacy+");
    expect(legacy.features.legacy).toBe(true);
    expect(legacy.features.privateDocuments).toBe(true);
    expect(free.features.legacy).toBeFalsy();
    expect(family.features.legacy).toBeFalsy();
  });
});

describe("isAdvancedMovieTheme", () => {
  it("flags cinematic as advanced", () => {
    expect(isAdvancedMovieTheme("cinematic")).toBe(true);
    expect(isAdvancedMovieTheme("vintage")).toBe(true);
  });

  it("treats other themes as non-advanced", () => {
    expect(isAdvancedMovieTheme("simple")).toBe(false);
    expect(isAdvancedMovieTheme("holiday")).toBe(false);
    expect(isAdvancedMovieTheme("bright")).toBe(false);
    expect(isAdvancedMovieTheme(null)).toBe(false);
    expect(isAdvancedMovieTheme(undefined)).toBe(false);
  });
});

describe("assertGateAllowed", () => {
  it("does nothing when allowed", () => {
    const ok: PlanGateResult = {
      allowed: true,
      planName: freeLimits.name,
      planSlug: String(freeLimits.slug),
      limits: freeLimits,
    };
    expect(() => assertGateAllowed(ok)).not.toThrow();
  });

  it("throws PlanGateError when denied", () => {
    const denied: PlanGateResult = {
      allowed: false,
      code: "movie_quota",
      reason: "Monthly movie limit reached.",
      planName: freeLimits.name,
      planSlug: String(freeLimits.slug),
      limits: freeLimits,
    };
    expect(() => assertGateAllowed(denied)).toThrow(PlanGateError);
    try {
      assertGateAllowed(denied);
    } catch (error) {
      expect(error).toBeInstanceOf(PlanGateError);
      expect((error as PlanGateError).code).toBe("movie_quota");
    }
  });
});
