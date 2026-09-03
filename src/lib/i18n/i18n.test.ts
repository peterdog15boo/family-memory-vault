import { describe, expect, it } from "vitest";
import { copyFromT } from "@/lib/i18n/copy";
import {
  APP_LOCALES,
  DEFAULT_LOCALE,
  isAppLocale,
  negotiateLocale,
  resolveLocale,
} from "@/lib/i18n/locales";
import { createTranslator } from "@/lib/i18n";

describe("i18n locales", () => {
  it("defaults to US English and lists the initial languages", () => {
    expect(DEFAULT_LOCALE).toBe("en-US");
    expect(APP_LOCALES).toEqual([
      "en-US",
      "es",
      "fr",
      "de",
      "pt-BR",
      "zh-CN",
      "ja",
      "ko",
      "it",
      "nl",
    ]);
  });

  it("orders the language selector English-first, then Spanish, French, German, …", () => {
    expect(APP_LOCALES[0]).toBe("en-US");
    expect(APP_LOCALES.slice(0, 4)).toEqual(["en-US", "es", "fr", "de"]);
  });

  it("negotiates Accept-Language tags onto supported locales", () => {
    expect(negotiateLocale(null)).toBe("en-US");
    expect(negotiateLocale("en-GB,en;q=0.9")).toBe("en-US");
    expect(negotiateLocale("es-MX,es;q=0.8")).toBe("es");
    expect(negotiateLocale("pt-PT,pt;q=0.9")).toBe("pt-BR");
    expect(negotiateLocale("zh-TW,zh;q=0.8")).toBe("zh-CN");
    expect(negotiateLocale("ja-JP")).toBe("ja");
    expect(isAppLocale("de")).toBe(true);
    expect(isAppLocale("en")).toBe(false);
    expect(resolveLocale("fr-CA")).toBe("fr");
  });
});

describe("t() lookups", () => {
  it("interpolates values and falls back to English", () => {
    const en = createTranslator("en-US");
    expect(en("nav.settings")).toBe("Settings");
    expect(en("nav.copyright", { year: 2026 })).toBe(
      "© 2026 Family Memory Vault",
    );
    expect(en("review.pendingMany", { n: 3 })).toContain("3");

    const es = createTranslator("es");
    expect(es("nav.settings")).toBe("Ajustes");
    expect(es("language.title")).toBe("Idioma");

    const missing = createTranslator("es");
    expect(missing("settings.privacySectionTitle")).toBe("Privacidad");
    expect(missing("common.deleteConfirmPhoto", { name: "x" })).toContain("x");
  });

  it("never throws on missing keys — returns English or the key", () => {
    const es = createTranslator("es");
    expect(() => es("totally.missing.key")).not.toThrow();
    expect(es("totally.missing.key")).toBe("totally.missing.key");
    // Known English key omitted from a locale still resolves via deep-merge.
    expect(typeof es("nav.settings")).toBe("string");
    expect(es("nav.settings").length).toBeGreaterThan(0);
  });

  it("returns the key for unknown messages", () => {
    const t = createTranslator("en-US");
    expect(t("does.not.exist")).toBe("does.not.exist");
  });

  it("builds locale-aware COPY from t()", () => {
    const t = createTranslator("es");
    const copy = copyFromT(t);
    expect(copy.empty.movies.title).toBe(t("empty.moviesTitle"));
    expect(copy.review.pendingMany(2)).toContain("2");
  });

  it("deep-merges locale overlays so new English keys are not dropped", () => {
    const es = createTranslator("es");
    expect(es("common.save")).not.toBe("common.save");
    expect(es("dashboard.recentMemories")).not.toBe("dashboard.recentMemories");
    // Newer English-only nested keys still resolve via merge/fallback.
    expect(es("common.deleteConfirmPhoto", { name: "pic.jpg" })).toContain(
      "pic.jpg",
    );
  });

  it("exposes Ava and Ask AI copy in non-English locales", () => {
    const es = createTranslator("es");
    expect(es("ava.steps.welcomeTitle")).not.toBe("ava.steps.welcomeTitle");
    expect(es("assistant.title")).not.toBe("assistant.title");
    expect(es("assistant.placeholder")).not.toBe("assistant.placeholder");
    expect(es("journey.memoriesProgress", { current: 1, next: 5 })).toContain(
      "1",
    );
    expect(es("notifications.memoryCreated.title")).not.toBe(
      "notifications.memoryCreated.title",
    );
    expect(es("family.circleTitle")).toBeTruthy();
    expect(es("notifications.familyMilestone.acceptedTitle")).toBeTruthy();
    expect(es("legacy.strengthTitle")).not.toBe("legacy.strengthTitle");
    expect(es("notifications.legacyMilestone.title")).not.toBe(
      "notifications.legacyMilestone.title",
    );
    expect(es("pages.legacyPlanTitle")).not.toBe("pages.legacyPlanTitle");
    expect(es("journey.boardEyebrow")).not.toBe("journey.boardEyebrow");
    expect(es("journey.actionPhotos", { count: 8, name: "Bronze" })).toContain(
      "8",
    );
    expect(es("settings.celebrationSoundHelp")).not.toBe(
      "settings.celebrationSoundHelp",
    );
    expect(es("settings.browserPushEnable")).not.toBe(
      "settings.browserPushEnable",
    );
    expect(es("feedback.modalTitle")).not.toBe("Help us improve");
    expect(es("beta.title")).not.toBe("Beta Tester Agreement");
    expect(es("assistant.messageLabel")).not.toBe("Your message to Ask AI");
    expect(es("memoryBox.promoCta")).not.toBe("Digitize");
    expect(es("documents.uploadTitle")).not.toBe("Upload private document");
    expect(es("people.facePrivacyNote")).not.toBe(
      createTranslator("en-US")("people.facePrivacyNote"),
    );
  });

  it("covers new namespaces in French and Japanese", () => {
    const fr = createTranslator("fr");
    const ja = createTranslator("ja");
    const en = createTranslator("en-US");
    expect(fr("documents.uploadTitle")).not.toBe("documents.uploadTitle");
    expect(fr("legacy.strengthTitle")).not.toBe(en("legacy.strengthTitle"));
    expect(ja("movie.shareEyebrow")).not.toBe("movie.shareEyebrow");
    expect(ja("memories.slideshowSettingsTitle")).not.toBe(
      "memories.slideshowSettingsTitle",
    );
    expect(ja("beta.submit")).not.toBe(en("beta.submit"));
    expect(ja("memoryBox.submitPay")).not.toBe(en("memoryBox.submitPay"));
  });

  it("translates home tiles, journey, idle, and onboarding chrome", () => {
    const es = createTranslator("es");
    const de = createTranslator("de");
    const en = createTranslator("en-US");
    expect(es("dashboard.tileSharedTitle")).not.toBe(en("dashboard.tileSharedTitle"));
    expect(es("dashboard.betaSwitchChip")).not.toBe(en("dashboard.betaSwitchChip"));
    expect(es("completeness.title")).not.toBe(en("completeness.title"));
    expect(es("session.idleTitle")).not.toBe(en("session.idleTitle"));
    expect(es("familyChat.title")).not.toBe(en("familyChat.title"));
    expect(es("onboarding.skipForNow")).not.toBe(en("onboarding.skipForNow"));
    expect(de("theme.savedNote")).not.toBe(en("theme.savedNote"));
    expect(es("onboarding.welcomeTitleNamed", { name: "Ada" })).toContain("Ada");
  });
});
