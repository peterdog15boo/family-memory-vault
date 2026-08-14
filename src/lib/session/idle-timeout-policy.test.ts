import { describe, expect, it } from "vitest";
import {
  buildIdleTimeoutPolicy,
  canDisableIdleTimeout,
  resolveEffectiveIdleTimeoutEnabled,
} from "@/lib/session/idle-timeout-policy";

describe("idle timeout policy", () => {
  it("never lets free plans disable timeout", () => {
    expect(canDisableIdleTimeout("free")).toBe(false);
    expect(resolveEffectiveIdleTimeoutEnabled(false, "free")).toBe(true);
    expect(resolveEffectiveIdleTimeoutEnabled(undefined, "free")).toBe(true);
    expect(buildIdleTimeoutPolicy({ preferenceEnabled: false, planSlug: "free" })).toEqual({
      preferenceEnabled: false,
      canDisable: false,
      enabled: true,
      planSlug: "free",
    });
  });

  it("defaults paid plans to enabled and allows disable", () => {
    expect(canDisableIdleTimeout("family")).toBe(true);
    expect(canDisableIdleTimeout("family_plus")).toBe(true);
    expect(resolveEffectiveIdleTimeoutEnabled(undefined, "family")).toBe(true);
    expect(resolveEffectiveIdleTimeoutEnabled(true, "family")).toBe(true);
    expect(resolveEffectiveIdleTimeoutEnabled(false, "family")).toBe(false);
    expect(
      buildIdleTimeoutPolicy({ preferenceEnabled: false, planSlug: "family_plus" }),
    ).toEqual({
      preferenceEnabled: false,
      canDisable: true,
      enabled: false,
      planSlug: "family_plus",
    });
  });
});
