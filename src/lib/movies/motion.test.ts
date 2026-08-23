import { describe, expect, it } from "vitest";
import {
  buildKenBurnsTimeline,
  clipZoomLinearProgress,
  easeInOutCubic,
  easeKenBurns,
  kenBurnsCrop,
  kenBurnsCrossfadeProgress,
  kenBurnsMotionDurationMs,
  resolveKenBurnsSampleCount,
  resolveZoomAmount,
  resolveZoomDirection,
  sliceKenBurnsSamplesByTime,
  splitDurationMs,
} from "@/lib/movies/motion";

describe("motion / Ken Burns", () => {
  it("eases smoothly at midpoints", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 5);
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25);
    expect(easeInOutCubic(0.75)).toBeGreaterThan(0.75);
  });

  it("ken burns ease moves immediately and finishes at t=1", () => {
    expect(easeKenBurns(0)).toBe(0);
    expect(easeKenBurns(1)).toBe(1);
    expect(easeKenBurns(0.5)).toBeCloseTo(0.5, 5);
    // Sine ease advances sooner than cubic near the start (no startup hold).
    expect(easeKenBurns(0.1)).toBeGreaterThan(easeInOutCubic(0.1));
    expect(easeKenBurns(0.1)).toBeGreaterThan(0.02);
    // And stays in motion near the end (no early finish plateau).
    expect(1 - easeKenBurns(0.9)).toBeGreaterThan(1 - easeInOutCubic(0.9));
  });

  it("maps linear progress strictly from elapsed / duration", () => {
    expect(clipZoomLinearProgress(0, 3000)).toBe(0);
    expect(clipZoomLinearProgress(1500, 3000)).toBeCloseTo(0.5);
    expect(clipZoomLinearProgress(3000, 3000)).toBe(1);
    expect(clipZoomLinearProgress(6000, 6000)).toBe(1);
    expect(clipZoomLinearProgress(-10, 3000)).toBe(0);
    expect(clipZoomLinearProgress(4000, 3000)).toBe(1);
  });

  it("alternates zoom direction", () => {
    expect(resolveZoomDirection("alternate", 0)).toBe("in");
    expect(resolveZoomDirection("alternate", 1)).toBe("out");
    expect(resolveZoomDirection("alternate", 2)).toBe("in");
    expect(resolveZoomDirection("always-in", 3)).toBe("in");
    expect(resolveZoomDirection("always-out", 0)).toBe("out");
    expect(resolveZoomDirection("off", 0)).toBe("none");
  });

  it("maps intensity into zoom amount without affecting timing", () => {
    expect(
      resolveZoomAmount({
        themeZoom: 0.1,
        intensityFactor: 1.55,
        direction: "in",
      }),
    ).toBeCloseTo(0.155);
    expect(
      resolveZoomAmount({
        themeZoom: 0.1,
        intensityFactor: 1,
        direction: "none",
      }),
    ).toBe(0);
  });

  it("produces continuous scale for zoom-in samples", () => {
    const start = kenBurnsCrop({
      progress: 0,
      direction: "in",
      zoomAmount: 0.15,
      width: 1280,
      height: 720,
    });
    const mid = kenBurnsCrop({
      progress: 0.5,
      direction: "in",
      zoomAmount: 0.15,
      width: 1280,
      height: 720,
    });
    const end = kenBurnsCrop({
      progress: 1,
      direction: "in",
      zoomAmount: 0.15,
      width: 1280,
      height: 720,
    });
    expect(start.scale).toBeCloseTo(1);
    expect(mid.scale).toBeGreaterThan(start.scale);
    expect(end.scale).toBeCloseTo(1.15);
    expect(end.frameW).toBeGreaterThanOrEqual(1280);
  });

  it("zooms out from max scale to 1", () => {
    const start = kenBurnsCrop({
      progress: 0,
      direction: "out",
      zoomAmount: 0.12,
      width: 1280,
      height: 720,
    });
    const end = kenBurnsCrop({
      progress: 1,
      direction: "out",
      zoomAmount: 0.12,
      width: 1280,
      height: 720,
    });
    expect(start.scale).toBeCloseTo(1.12);
    expect(end.scale).toBeCloseTo(1);
  });

  it("splits duration without losing ms", () => {
    const parts = splitDurationMs(3500, 10);
    expect(parts).toHaveLength(10);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(3500);
  });

  it("scales sample count with clip duration (not a fixed budget)", () => {
    const short = resolveKenBurnsSampleCount({
      durationMs: 2000,
      zoomAmount: 0.1,
      fast: false,
      targetFps: 30,
    });
    const longer = resolveKenBurnsSampleCount({
      durationMs: 4000,
      zoomAmount: 0.1,
      fast: false,
      targetFps: 30,
    });
    // zoomAmount 0.1 → 1.75× density over encode fps
    expect(short).toBe(105);
    expect(longer).toBe(210);
    expect(longer).toBeGreaterThan(short);
  });

  it("derives sample density from duration × fps (encode-matched)", () => {
    const n = resolveKenBurnsSampleCount({
      durationMs: 6000,
      zoomAmount: 0.1,
      fast: false,
      targetFps: 30,
    });
    expect(n).toBe(315);
  });

  it("boosts sample density for gentle zooms", () => {
    const gentle = resolveKenBurnsSampleCount({
      durationMs: 4000,
      zoomAmount: 0.05,
      fast: false,
      targetFps: 30,
    });
    const strong = resolveKenBurnsSampleCount({
      durationMs: 4000,
      zoomAmount: 0.2,
      fast: false,
      targetFps: 30,
    });
    expect(gentle).toBe(270); // 2.25× fps
    expect(strong).toBe(180); // 1.5× fps
    expect(gentle).toBeGreaterThan(strong);
  });

  it("spans zoom 0→1 across the full clip duration for 3s and 6s", () => {
    for (const durationMs of [3000, 6000]) {
      const plan = buildKenBurnsTimeline({
        durationMs,
        photoIndex: 0,
        directionMode: "alternate",
        themeZoom: 0.1,
        intensityFactor: 1,
        width: 1920,
        height: 1080,
        targetFps: 30,
      });
      expect(plan.direction).toBe("in");
      expect(plan.samples[0]!.progress).toBe(0);
      expect(plan.samples.at(-1)!.progress).toBe(1);
      expect(plan.samples.reduce((s, x) => s + x.holdMs, 0)).toBe(durationMs);
      expect(plan.samples[0]!.scale).toBeLessThan(plan.samples.at(-1)!.scale);
      // Early samples must already be moving (no startup hold).
      expect(plan.samples[1]!.scale).toBeGreaterThan(plan.samples[0]!.scale);
      // Scale keeps changing near the end (no early finish).
      const n = plan.samples.length;
      expect(plan.samples[n - 1]!.scale).toBeGreaterThan(
        plan.samples[n - 2]!.scale,
      );
    }
  });

  it("keeps hold duration at or below one encode frame", () => {
    const plan = buildKenBurnsTimeline({
      durationMs: 3200,
      photoIndex: 0,
      directionMode: "always-in",
      themeZoom: 0.1,
      intensityFactor: 1,
      width: 1280,
      height: 720,
      targetFps: 30,
    });
    // 3.2s × 30fps × 1.75 density = 168 samples
    expect(plan.samples).toHaveLength(168);
    const avgHold =
      plan.samples.reduce((s, x) => s + x.holdMs, 0) / plan.samples.length;
    expect(avgHold).toBeLessThanOrEqual(1000 / 30 + 0.5);
  });

  it("keeps alternating direction across clips with mixed durations", () => {
    const durations = [2200, 4500, 3200];
    const directions = durations.map((durationMs, photoIndex) =>
      buildKenBurnsTimeline({
        durationMs,
        photoIndex,
        directionMode: "alternate",
        themeZoom: 0.1,
        intensityFactor: 1,
        width: 1080,
        height: 1920,
        targetFps: 30,
      }),
    );
    expect(directions.map((d) => d.direction)).toEqual(["in", "out", "in"]);
    for (let i = 0; i < durations.length; i++) {
      const plan = directions[i]!;
      expect(plan.samples.reduce((s, x) => s + x.holdMs, 0)).toBe(
        durations[i],
      );
      expect(plan.samples[0]!.progress).toBe(0);
      expect(plan.samples.at(-1)!.progress).toBe(1);
    }
  });

  it("intensity changes distance only — duration stays clip length", () => {
    const subtle = buildKenBurnsTimeline({
      durationMs: 4000,
      photoIndex: 0,
      directionMode: "always-in",
      themeZoom: 0.1,
      intensityFactor: 0.55,
      width: 1280,
      height: 720,
      targetFps: 30,
    });
    const strong = buildKenBurnsTimeline({
      durationMs: 4000,
      photoIndex: 0,
      directionMode: "always-in",
      themeZoom: 0.1,
      intensityFactor: 1.55,
      width: 1280,
      height: 720,
      targetFps: 30,
    });
    expect(subtle.samples.reduce((s, x) => s + x.holdMs, 0)).toBe(4000);
    expect(strong.samples.reduce((s, x) => s + x.holdMs, 0)).toBe(4000);
    expect(strong.samples.at(-1)!.scale).toBeGreaterThan(
      subtle.samples.at(-1)!.scale,
    );
  });

  it("handles very short and zoom-off clips", () => {
    const short = buildKenBurnsTimeline({
      durationMs: 800,
      photoIndex: 0,
      directionMode: "alternate",
      themeZoom: 0.1,
      intensityFactor: 1,
      width: 1280,
      height: 720,
      targetFps: 30,
    });
    expect(short.samples[0]!.progress).toBe(0);
    expect(short.samples.at(-1)!.progress).toBe(1);
    expect(short.samples.reduce((s, x) => s + x.holdMs, 0)).toBe(800);

    const off = buildKenBurnsTimeline({
      durationMs: 5000,
      photoIndex: 0,
      directionMode: "off",
      themeZoom: 0.1,
      intensityFactor: 1,
      width: 1280,
      height: 720,
    });
    expect(off.samples).toHaveLength(1);
    expect(off.samples[0]!.holdMs).toBe(5000);
    expect(off.zoomAmount).toBe(0);
  });

  it("scale advances monotonically across every sample for zoom-in", () => {
    const plan = buildKenBurnsTimeline({
      durationMs: 3000,
      photoIndex: 0,
      directionMode: "always-in",
      themeZoom: 0.12,
      intensityFactor: 1,
      width: 1280,
      height: 720,
      targetFps: 30,
    });
    for (let i = 1; i < plan.samples.length; i++) {
      expect(plan.samples[i]!.scale).toBeGreaterThanOrEqual(
        plan.samples[i - 1]!.scale,
      );
      expect(plan.samples[i]!.progress).toBeGreaterThan(
        plan.samples[i - 1]!.progress,
      );
    }
  });

  it("zoom-out decreases scale monotonically with same magnitude as zoom-in", () => {
    const zoomIn = buildKenBurnsTimeline({
      durationMs: 3000,
      photoIndex: 0,
      directionMode: "always-in",
      themeZoom: 0.12,
      intensityFactor: 1,
      width: 1280,
      height: 720,
      targetFps: 24,
    });
    const zoomOut = buildKenBurnsTimeline({
      durationMs: 3000,
      photoIndex: 0,
      directionMode: "always-out",
      themeZoom: 0.12,
      intensityFactor: 1,
      width: 1280,
      height: 720,
      targetFps: 24,
    });
    expect(zoomIn.direction).toBe("in");
    expect(zoomOut.direction).toBe("out");
    expect(zoomIn.startScale).toBeLessThan(zoomIn.endScale);
    expect(zoomOut.startScale).toBeGreaterThan(zoomOut.endScale);
    expect(zoomIn.zoomAmount).toBeCloseTo(zoomOut.zoomAmount);
    expect(zoomIn.endScale - zoomIn.startScale).toBeCloseTo(
      zoomOut.startScale - zoomOut.endScale,
    );
    for (let i = 1; i < zoomOut.samples.length; i++) {
      expect(zoomOut.samples[i]!.scale).toBeLessThanOrEqual(
        zoomOut.samples[i - 1]!.scale,
      );
    }
  });

  it("extends motion duration with lead and trail crossfade windows", () => {
    expect(
      kenBurnsMotionDurationMs({
        clipDurationMs: 3000,
        leadTransitionMs: 500,
        trailTransitionMs: 500,
      }),
    ).toBe(4000);
    expect(
      kenBurnsMotionDurationMs({
        clipDurationMs: 3000,
      }),
    ).toBe(3000);
  });

  it("advances both sides of a crossfade so zoom never freezes", () => {
    const early = kenBurnsCrossfadeProgress({
      transitionU: 0.2,
      outgoing: { leadMs: 0, clipDurationMs: 3000, trailMs: 500 },
      incoming: { leadMs: 500, clipDurationMs: 3000, trailMs: 0 },
    });
    const late = kenBurnsCrossfadeProgress({
      transitionU: 0.8,
      outgoing: { leadMs: 0, clipDurationMs: 3000, trailMs: 500 },
      incoming: { leadMs: 500, clipDurationMs: 3000, trailMs: 0 },
    });
    // Outgoing continues past the solo end (3000/3500) during the trail.
    expect(early.fromProgress).toBeGreaterThan(3000 / 3500);
    expect(late.fromProgress).toBeGreaterThan(early.fromProgress);
    expect(late.fromProgress).toBeLessThan(1);
    // Incoming starts zooming during the dissolve (not stuck at 0).
    expect(early.toProgress).toBeGreaterThan(0);
    expect(late.toProgress).toBeGreaterThan(early.toProgress);
    expect(late.toProgress).toBeLessThan(500 / 3500);
  });

  it("slices solo samples without lead/trail holds", () => {
    const plan = buildKenBurnsTimeline({
      durationMs: 4000,
      photoIndex: 0,
      directionMode: "always-in",
      themeZoom: 0.1,
      intensityFactor: 1,
      width: 640,
      height: 360,
      targetFps: 10,
    });
    const solo = sliceKenBurnsSamplesByTime(plan.samples, 500, 3500);
    const soloMs = solo.reduce((s, x) => s + x.holdMs, 0);
    expect(soloMs).toBe(3000);
    expect(solo[0]!.elapsedMs).toBeGreaterThanOrEqual(500);
    const last = solo.at(-1)!;
    expect(last.elapsedMs + last.holdMs).toBeLessThanOrEqual(3500);
  });
});
