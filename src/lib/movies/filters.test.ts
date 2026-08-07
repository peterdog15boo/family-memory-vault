import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  COLOR_FILTER_CATALOG,
  COLOR_FILTERS,
  colorFilterIntensityFactor,
  getColorFilter,
  lerpColorGrade,
  resolveMovieColorGrade,
  COLOR_GRADE_IDENTITY,
} from "@/lib/movies/filters";
import { applyColorGrade, prepareGradeOverlays } from "@/lib/movies/effects";
import { normalizeMovieSettings } from "@/lib/movies/settings";

describe("COLOR_FILTER_CATALOG", () => {
  it("covers every filter id", () => {
    const ids = new Set(COLOR_FILTER_CATALOG.map((f) => f.id));
    for (const id of COLOR_FILTERS) {
      expect(ids.has(id)).toBe(true);
    }
  });
});

describe("resolveMovieColorGrade", () => {
  it("scales teal-orange toward identity at subtle intensity", () => {
    const subtle = resolveMovieColorGrade({
      themeGrade: COLOR_GRADE_IDENTITY,
      filterId: "teal_orange",
      intensity: "subtle",
    });
    const strong = resolveMovieColorGrade({
      themeGrade: COLOR_GRADE_IDENTITY,
      filterId: "teal_orange",
      intensity: "strong",
    });
    expect(Math.abs(subtle.contrast - 1)).toBeLessThan(
      Math.abs(strong.contrast - 1),
    );
    expect(subtle.shadowTintOpacity ?? 0).toBeLessThan(
      strong.shadowTintOpacity ?? 0,
    );
  });

  it("desaturates black & white fully at every intensity", () => {
    for (const intensity of ["subtle", "medium", "strong"] as const) {
      const grade = resolveMovieColorGrade({
        themeGrade: COLOR_GRADE_IDENTITY,
        filterId: "black_white",
        intensity,
      });
      expect(grade.saturation, intensity).toBe(0);
    }
  });

  it("keeps vintage grain when grain toggle is auto (null)", () => {
    const grade = resolveMovieColorGrade({
      themeGrade: COLOR_GRADE_IDENTITY,
      filterId: "vintage_film",
      intensity: "strong",
      grainEnabled: null,
      vignetteEnabled: null,
    });
    expect(grade.grain).toBeGreaterThan(0.1);
    expect(grade.vignette).toBe(true);
    expect(grade.tintOpacity).toBeGreaterThan(0.15);
  });

  it("forces grain and vignette off when toggled", () => {
    const grade = resolveMovieColorGrade({
      themeGrade: COLOR_GRADE_IDENTITY,
      filterId: "vintage_film",
      intensity: "strong",
      grainEnabled: false,
      vignetteEnabled: false,
    });
    expect(grade.grain).toBe(0);
    expect(grade.vignette).toBe(false);
  });

  it("falls back to theme grade when filter is null", () => {
    const theme = {
      ...COLOR_GRADE_IDENTITY,
      label: "theme-test",
      brightness: 1.2,
      saturation: 1.3,
    };
    const grade = resolveMovieColorGrade({
      themeGrade: theme,
      filterId: null,
      intensity: "strong",
    });
    expect(grade.brightness).toBeCloseTo(1.2, 5);
    expect(grade.saturation).toBeCloseTo(1.3, 5);
  });
});

describe("lerpColorGrade", () => {
  it("returns identity at t=0 and target at t=1", () => {
    const target = getColorFilter("golden_hour").grade;
    expect(lerpColorGrade(COLOR_GRADE_IDENTITY, target, 0).lightLeak).toBe(0);
    expect(lerpColorGrade(COLOR_GRADE_IDENTITY, target, 1).lightLeak).toBe(
      target.lightLeak,
    );
  });
});

describe("colorFilterIntensityFactor", () => {
  it("orders subtle < medium < strong", () => {
    expect(colorFilterIntensityFactor("subtle")).toBeLessThan(
      colorFilterIntensityFactor("medium"),
    );
    expect(colorFilterIntensityFactor("medium")).toBeLessThan(
      colorFilterIntensityFactor("strong"),
    );
  });
});

describe("normalizeMovieSettings color filter", () => {
  it("defaults to clean / medium with grain+vignette auto (filter defaults)", () => {
    const n = normalizeMovieSettings({});
    expect(n.colorFilter).toBe("clean");
    expect(n.colorFilterIntensity).toBe("medium");
    expect(n.filterGrain).toBeNull();
    expect(n.filterVignette).toBeNull();
  });
});

describe("prepareGradeOverlays + applyColorGrade", () => {
  it("applies filter grade to a real frame buffer", async () => {
    const base = await sharp({
      create: {
        width: 80,
        height: 45,
        channels: 3,
        background: { r: 120, g: 140, b: 160 },
      },
    })
      .jpeg()
      .toBuffer();

    const grade = resolveMovieColorGrade({
      themeGrade: COLOR_GRADE_IDENTITY,
      filterId: "soft_glow",
      intensity: "medium",
      grainEnabled: true,
      vignetteEnabled: true,
    });
    const pack = await prepareGradeOverlays(grade, 80, 45);
    expect(pack.overlays.length).toBeGreaterThan(0);

    const out = await applyColorGrade(sharp(base), grade, 80, 45).then((p) =>
      p.jpeg().toBuffer(),
    );
    expect(out.byteLength).toBeGreaterThan(200);
  });

  it("black_white vs clean changes pixels measurably", async () => {
    const base = await sharp({
      create: {
        width: 120,
        height: 68,
        channels: 3,
        background: { r: 40, g: 170, b: 90 },
      },
    })
      .jpeg({ quality: 95 })
      .toBuffer();

    async function meanChannels(buf: Buffer) {
      const { data } = await sharp(buf)
        .raw()
        .toBuffer({ resolveWithObject: true });
      let r = 0,
        g = 0,
        b = 0;
      const n = data.length / 3;
      for (let i = 0; i < data.length; i += 3) {
        r += data[i]!;
        g += data[i + 1]!;
        b += data[i + 2]!;
      }
      return { r: r / n, g: g / n, b: b / n };
    }

    const clean = resolveMovieColorGrade({
      themeGrade: COLOR_GRADE_IDENTITY,
      filterId: "clean",
      intensity: "medium",
    });
    const bw = resolveMovieColorGrade({
      themeGrade: COLOR_GRADE_IDENTITY,
      filterId: "black_white",
      intensity: "medium",
      grainEnabled: null,
      vignetteEnabled: null,
    });
    expect(bw.saturation).toBe(0);

    const cleanOut = await applyColorGrade(sharp(base), clean, 120, 68).then(
      (p) => p.jpeg({ quality: 95 }).toBuffer(),
    );
    const bwOut = await applyColorGrade(sharp(base), bw, 120, 68).then((p) =>
      p.jpeg({ quality: 95 }).toBuffer(),
    );
    const c = await meanChannels(cleanOut);
    const m = await meanChannels(bwOut);
    // Clean stays green-dominant; B&W channels converge.
    expect(c.g - c.r).toBeGreaterThan(40);
    expect(Math.abs(m.r - m.g)).toBeLessThan(8);
    expect(Math.abs(m.g - m.b)).toBeLessThan(8);
  });

  it("applies fractional lerped hue without sharp validation errors", async () => {
    const base = await sharp({
      create: {
        width: 40,
        height: 24,
        channels: 3,
        background: { r: 90, g: 130, b: 180 },
      },
    })
      .jpeg()
      .toBuffer();

    // teal_orange hue is -6; medium intensity used to lerp to -5.28 and crash Sharp.
    const grade = resolveMovieColorGrade({
      themeGrade: COLOR_GRADE_IDENTITY,
      filterId: "teal_orange",
      intensity: "medium",
    });
    expect(Number.isInteger(grade.hue)).toBe(true);
    expect(grade.hue).toBe(Math.round(-6 * 0.88));

    const pack = await prepareGradeOverlays(grade, 40, 24);
    expect(Number.isInteger(pack.hue)).toBe(true);

    const out = await applyColorGrade(sharp(base), grade, 40, 24).then((p) =>
      p.jpeg().toBuffer(),
    );
    expect(out.byteLength).toBeGreaterThan(100);
  });
});
