import { describe, expect, it } from "vitest";
import {
  DEFAULT_USER_ACCOUNT_PREFERENCES,
  publicAccountPreferences,
  resolveAccountPreferences,
} from "@/lib/account-preferences";

describe("account preferences", () => {
  it("defaults alerts on and product updates off", () => {
    const prefs = resolveAccountPreferences({});
    expect(prefs.emailMovieReady).toBe(true);
    expect(prefs.inAppEmergencyAccess).toBe(true);
    expect(prefs.celebrationSoundEnabled).toBe(false);
    expect(prefs.emailMilestoneCelebrations).toBe(true);
    expect(prefs.productUpdatesEmail).toBe(false);
    expect(prefs).toMatchObject(DEFAULT_USER_ACCOUNT_PREFERENCES);
  });

  it("merges stored toggles without inventing unknown keys in public payload", () => {
    const prefs = resolveAccountPreferences({
      emailMovieReady: false,
      productUpdatesEmail: true,
      lastStorageWarningAt: "2026-07-30T00:00:00.000Z",
    });
    expect(prefs.emailMovieReady).toBe(false);
    expect(prefs.productUpdatesEmail).toBe(true);
    expect(prefs.lastStorageWarningAt).toBe("2026-07-30T00:00:00.000Z");

    const pub = publicAccountPreferences(prefs);
    expect(pub.emailMovieReady).toBe(false);
    expect(pub).not.toHaveProperty("lastStorageWarningAt");
    expect(pub.locale).toBe("en-US");
  });

  it("defaults locale to en-US and accepts a supported locale", () => {
    expect(resolveAccountPreferences({}).locale).toBe("en-US");
    expect(resolveAccountPreferences({ locale: "es" }).locale).toBe("es");
    expect(resolveAccountPreferences({ locale: "not-a-locale" }).locale).toBe(
      "en-US",
    );

    const pub = publicAccountPreferences(
      resolveAccountPreferences({ locale: "pt-BR" }),
    );
    expect(pub.locale).toBe("pt-BR");
  });
});
