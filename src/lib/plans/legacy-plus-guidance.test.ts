import { describe, expect, it } from "vitest";
import { buildLegacyPlusGuidance } from "@/lib/plans/legacy-plus-guidance";

describe("buildLegacyPlusGuidance", () => {
  it("guides Legacy+ users into the feature without an upgrade note", () => {
    const g = buildLegacyPlusGuidance({
      hasAccess: true,
      kind: "digital_legacy",
      betaMode: false,
    });
    expect(g.upgradeNote).toBeNull();
    expect(g.href).toBe("/documents/legacy");
    expect(g.ctaLabel).toMatch(/Digital Legacy/i);
  });

  it("requires upgrade for non-Legacy+ users", () => {
    const g = buildLegacyPlusGuidance({
      hasAccess: false,
      kind: "private_documents",
      betaMode: false,
    });
    expect(g.upgradeNote).toMatch(/Legacy\+/);
    expect(g.upgradeNote).toMatch(/upgrade/i);
    expect(g.href).toBe("/billing");
  });

  it("points beta users at the free plan switcher", () => {
    const g = buildLegacyPlusGuidance({
      hasAccess: false,
      kind: "legacy_plus_bundle",
      betaMode: true,
    });
    expect(g.upgradeNote).toMatch(/free during beta/i);
    expect(g.ctaLabel).toMatch(/free in beta/i);
    expect(g.href).toBe("/billing");
  });
});
