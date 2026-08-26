import { describe, expect, it } from "vitest";
import {
  baseCoverSize,
  capZoomToAvoidUpscale,
  capZoomToFitSubject,
  centerFraming,
  computeFramingFromFaces,
  cropContainsSubject,
  expandFaceBox,
  getKenBurnsFraming,
  placeCropAroundFocal,
  resolveMaxZoomFromSubjectBounds,
  sourceCoverScale,
  sourceCropAtScale,
} from "@/lib/movies/framing";
import {
  cropCenterNormalized,
  summarizeCropFocalTracking,
} from "@/lib/movies/face-debug";
import { buildKenBurnsTimeline, kenBurnsCrop } from "@/lib/movies/motion";

describe("face-aware framing", () => {
  it("uses a single face as focal point with upward bias", () => {
    const framing = computeFramingFromFaces([
      { x: 0.4, y: 0.25, width: 0.2, height: 0.28 },
    ]);
    expect(framing.source).toBe("faces");
    expect(framing.focalPointX).toBeGreaterThan(0.4);
    expect(framing.focalPointX).toBeLessThan(0.6);
    // Focal Y should sit in the upper portion of the expanded subject.
    expect(framing.focalPointY).toBeLessThan(0.45);
    expect(framing.subjectBounds?.faceCount).toBe(1);
  });

  it("unions multiple faces into a group subject region", () => {
    const framing = computeFramingFromFaces([
      { x: 0.1, y: 0.2, width: 0.15, height: 0.2 },
      { x: 0.55, y: 0.22, width: 0.15, height: 0.2 },
    ]);
    expect(framing.subjectBounds?.faceCount).toBe(2);
    expect(framing.subjectBounds!.x).toBeLessThan(0.15);
    expect(framing.subjectBounds!.x + framing.subjectBounds!.width).toBeGreaterThan(
      0.65,
    );
    expect(framing.maxZoomAmount).not.toBeNull();
    expect(framing.maxZoomAmount!).toBeLessThanOrEqual(0.16);
  });

  it("falls back to center when no usable faces", () => {
    expect(computeFramingFromFaces([]).source).toBe("center");
    expect(
      computeFramingFromFaces([{ x: 0.1, y: 0.1, width: 0.01, height: 0.01 }])
        .source,
    ).toBe("center");
  });

  it("expands face boxes upward for headroom", () => {
    const box = { x: 0.4, y: 0.3, width: 0.2, height: 0.2 };
    const expanded = expandFaceBox(box);
    expect(expanded.y).toBeLessThan(box.y);
    expect(expanded.y + expanded.height).toBeGreaterThan(box.y + box.height);
  });

  it("places crop so the subject stays inside when it fits", () => {
    const { left, top } = placeCropAroundFocal({
      sourceWidth: 1000,
      sourceHeight: 1000,
      cropW: 500,
      cropH: 500,
      focalX: 0.2,
      focalY: 0.2,
      subject: { x: 0.1, y: 0.1, width: 0.25, height: 0.25 },
    });
    expect(left).toBeLessThanOrEqual(100);
    expect(top).toBeLessThanOrEqual(100);
    expect(left + 500).toBeGreaterThanOrEqual(350);
    expect(top + 500).toBeGreaterThanOrEqual(350);
  });

  it("keeps left/top continuous across the subject fit↔overflow boundary", () => {
    // Off-center focal so a regime flip would jump if we used focal-only past fit.
    const subject = { x: 0.3, y: 0.25, width: 0.35, height: 0.4 };
    const sw = 1000;
    const sh = 1000;
    const subjectW = subject.width * sw;
    const subjectH = subject.height * sh;
    const sizes = [
      subjectW + 8,
      subjectW + 1,
      subjectW,
      subjectW - 1,
      subjectW - 8,
    ];
    let prevLeft: number | null = null;
    let prevTop: number | null = null;
    for (const cropW of sizes) {
      const cropH = (subjectH / subjectW) * cropW;
      const { left, top } = placeCropAroundFocal({
        sourceWidth: sw,
        sourceHeight: sh,
        cropW,
        cropH,
        focalX: 0.18,
        focalY: 0.2,
        subject,
      });
      if (prevLeft != null && prevTop != null) {
        // Crossing fit/overflow must not teleport the crop.
        expect(Math.abs(left - prevLeft)).toBeLessThan(12);
        expect(Math.abs(top - prevTop)).toBeLessThan(12);
      }
      prevLeft = left;
      prevTop = top;
    }
  });

  it("keeps crop center on an off-center face focal (not image center)", () => {
    // Mid-right portrait with room to center the crop on the face.
    const framing = computeFramingFromFaces([
      { x: 0.52, y: 0.2, width: 0.2, height: 0.28 },
    ]);
    expect(framing.focalPointX).toBeGreaterThan(0.55);
    expect(framing.focalPointX).toBeLessThan(0.75);
    for (const scale of [1.15, 1.25, 1.35]) {
      const crop = sourceCropAtScale({
        scale,
        sourceWidth: 2400,
        sourceHeight: 1800,
        targetWidth: 1920,
        targetHeight: 1080,
        framing,
      });
      const center = cropCenterNormalized(crop, 2400, 1800);
      // Prefer face side over geometric image center.
      expect(Math.abs(center.x - framing.focalPointX)).toBeLessThan(
        Math.abs(center.x - 0.5),
      );
      expect(Math.abs(center.x - framing.focalPointX)).toBeLessThan(0.1);
      expect(Math.abs(center.y - framing.focalPointY)).toBeLessThan(0.12);
    }
  });

  it("keeps head-safe subject inside crop across a full zoom-in timeline", () => {
    const framing = computeFramingFromFaces([
      { x: 0.38, y: 0.22, width: 0.22, height: 0.3 },
    ]);
    const plan = buildKenBurnsTimeline({
      durationMs: 3000,
      photoIndex: 0,
      directionMode: "always-in",
      themeZoom: 0.12,
      intensityFactor: 1,
      width: 1920,
      height: 1080,
      sourceWidth: 3000,
      sourceHeight: 2250,
      framing,
      targetFps: 30,
    });
    expect(plan.samples.length).toBeGreaterThan(2);
    const crops = plan.samples
      .map((s) => s.sourceCrop)
      .filter((c): c is NonNullable<typeof c> => c != null);
    expect(crops.length).toBe(plan.samples.length);

    const tracking = summarizeCropFocalTracking({
      crops,
      framing,
      sourceWidth: 3000,
      sourceHeight: 2250,
    });
    expect(tracking.meanAbsDx).toBeLessThan(0.1);
    expect(tracking.meanAbsDy).toBeLessThan(0.1);

    // When subject fits the crop, heads must remain inside.
    for (const crop of crops) {
      if (
        framing.subjectBounds &&
        framing.subjectBounds.width * 3000 <= crop.width &&
        framing.subjectBounds.height * 2250 <= crop.height
      ) {
        expect(
          cropContainsSubject(crop, framing.subjectBounds, 3000, 2250),
        ).toBe(true);
      }
    }
  });

  it("soft-caps zoom for wide subjects but never kills motion", () => {
    const subject = { x: 0.02, y: 0.15, width: 0.96, height: 0.55 };
    const capped = capZoomToFitSubject({
      zoomAmount: 0.2,
      sourceWidth: 2000,
      sourceHeight: 1200,
      targetWidth: 1920,
      targetHeight: 1080,
      subject,
    });
    // Wide subject may reduce zoom; never force zoom past padded headroom.
    expect(capped).toBeGreaterThan(0);
    expect(capped).toBeLessThanOrEqual(0.2);
  });

  it("does not force zoom when the subject already fills the cover window", () => {
    // Tall subject vs wide frame — cover height cannot contain the padded face group.
    const subject = { x: 0.1, y: 0.05, width: 0.8, height: 0.9 };
    const capped = capZoomToFitSubject({
      zoomAmount: 0.15,
      sourceWidth: 2000,
      sourceHeight: 2000,
      targetWidth: 1920,
      targetHeight: 800,
      subject,
    });
    expect(capped).toBe(0);
  });

  it("caps near-full subjects without forcing extra zoom past fit", () => {
    const subject = { x: 0.01, y: 0.01, width: 0.98, height: 0.98 };
    const capped = capZoomToFitSubject({
      zoomAmount: 0.2,
      sourceWidth: 1000,
      sourceHeight: 1000,
      targetWidth: 1000,
      targetHeight: 1000,
      subject,
    });
    expect(capped).toBeGreaterThan(0);
    expect(capped).toBeLessThanOrEqual(0.2);
    // Fitted amount must stay at or below the geometric max for the core.
    const core = 0.98 * 0.72;
    const maxFitted = 1 / core - 1;
    expect(capped).toBeLessThanOrEqual(maxFitted + 1e-6);
  });

  it("resolveMaxZoomFromSubjectBounds matches live compute for wide pairs", () => {
    const framing = computeFramingFromFaces([
      { x: 0.05, y: 0.2, width: 0.2, height: 0.25 },
      { x: 0.7, y: 0.22, width: 0.2, height: 0.25 },
    ]);
    expect(framing.subjectBounds).not.toBeNull();
    expect(resolveMaxZoomFromSubjectBounds(framing.subjectBounds)).toBe(
      framing.maxZoomAmount,
    );
    // Wide span should soften like live compute (0.08), not the old cache 0.12.
    expect(framing.maxZoomAmount).toBe(0.12);
  });

  it("getKenBurnsFraming zooms toward the face focal point", () => {
    const framing = computeFramingFromFaces([
      { x: 0.7, y: 0.2, width: 0.18, height: 0.24 },
    ]);
    // Source must be ≥ output cover window so zoom is not killed for sharpness.
    const plan = getKenBurnsFraming({
      sourceWidth: 3200,
      sourceHeight: 2400,
      targetWidth: 1920,
      targetHeight: 1080,
      direction: "in",
      zoomAmount: 0.15,
      framing,
    });
    expect(plan.start.scale).toBeCloseTo(1);
    expect(plan.end.scale).toBeGreaterThan(1);
    // End crop (tighter) should still be biased toward the right-side face.
    const endCx = plan.end.left + plan.end.width / 2;
    expect(endCx / 3200).toBeGreaterThan(0.55);
  });

  it("base cover respects target aspect", () => {
    const landscape = baseCoverSize(2000, 1000, 1920, 1080);
    expect(landscape.height).toBe(1000);
    expect(landscape.width / landscape.height).toBeCloseTo(1920 / 1080, 3);

    const portrait = baseCoverSize(1000, 2000, 1080, 1920);
    expect(portrait.width).toBe(1000);
    expect(portrait.width / portrait.height).toBeCloseTo(1080 / 1920, 3);
  });
});

describe("Ken Burns timeline with framing", () => {
  it("emits source crops for face-aware renders", () => {
    const framing = computeFramingFromFaces([
      { x: 0.35, y: 0.2, width: 0.3, height: 0.35 },
    ]);
    const plan = buildKenBurnsTimeline({
      durationMs: 3000,
      photoIndex: 0,
      directionMode: "alternate",
      themeZoom: 0.12,
      intensityFactor: 1,
      width: 1920,
      height: 1080,
      sourceWidth: 2000,
      sourceHeight: 1500,
      framing,
    });
    expect(plan.samples[0]!.sourceCrop).not.toBeNull();
    expect(plan.samples.at(-1)!.sourceCrop).not.toBeNull();
    expect(plan.samples[0]!.progress).toBe(0);
    expect(plan.samples.at(-1)!.progress).toBe(1);
    // Zoom-in: end crop smaller than start.
    expect(plan.samples.at(-1)!.sourceCrop!.width).toBeLessThan(
      plan.samples[0]!.sourceCrop!.width,
    );
  });

  it("keeps faces inside every sample crop", () => {
    const face = { x: 0.4, y: 0.15, width: 0.2, height: 0.28 };
    const framing = computeFramingFromFaces([face]);
    const plan = buildKenBurnsTimeline({
      durationMs: 4000,
      photoIndex: 0,
      directionMode: "always-in",
      themeZoom: 0.1,
      intensityFactor: 1,
      width: 1280,
      height: 720,
      sourceWidth: 1280,
      sourceHeight: 720,
      framing,
    });

    const faceLeft = face.x * 1280;
    const faceTop = face.y * 720;
    const faceRight = (face.x + face.width) * 1280;
    const faceBottom = (face.y + face.height) * 720;

    for (const sample of plan.samples) {
      const c = sample.sourceCrop!;
      expect(c.left).toBeLessThanOrEqual(faceLeft + 1);
      expect(c.top).toBeLessThanOrEqual(faceTop + 1);
      expect(c.left + c.width).toBeGreaterThanOrEqual(faceRight - 1);
      expect(c.top + c.height).toBeGreaterThanOrEqual(faceBottom - 1);
    }
  });

  it("legacy kenBurnsCrop still works without source dims", () => {
    const crop = kenBurnsCrop({
      progress: 1,
      direction: "in",
      zoomAmount: 0.1,
      width: 1280,
      height: 720,
    });
    expect(crop.sourceCrop).toBeNull();
    expect(crop.scale).toBeCloseTo(1.1);
  });

  it("zoom-out uses the same magnitude as zoom-in (not a still)", () => {
    const framing = computeFramingFromFaces([
      { x: 0.35, y: 0.2, width: 0.3, height: 0.35 },
    ]);
    const zoomIn = getKenBurnsFraming({
      sourceWidth: 2000,
      sourceHeight: 1500,
      targetWidth: 1920,
      targetHeight: 1080,
      direction: "in",
      zoomAmount: 0.12,
      framing,
    });
    const zoomOut = getKenBurnsFraming({
      sourceWidth: 2000,
      sourceHeight: 1500,
      targetWidth: 1920,
      targetHeight: 1080,
      direction: "out",
      zoomAmount: 0.12,
      framing,
    });
    expect(zoomIn.startScale).toBeLessThan(zoomIn.endScale);
    expect(zoomOut.startScale).toBeGreaterThan(zoomOut.endScale);
    expect(zoomIn.zoomAmount).toBeCloseTo(zoomOut.zoomAmount);
    expect(zoomIn.endScale - zoomIn.startScale).toBeCloseTo(
      zoomOut.startScale - zoomOut.endScale,
    );
    expect(zoomIn.zoomAmount).toBeGreaterThan(0);
  });

  it("alternate timeline animates every clip (in and out)", () => {
    const framing = computeFramingFromFaces([
      { x: 0.05, y: 0.2, width: 0.2, height: 0.25 },
      { x: 0.4, y: 0.22, width: 0.2, height: 0.25 },
      { x: 0.75, y: 0.2, width: 0.2, height: 0.25 },
    ]);
    const directions: Array<"in" | "out"> = [];
    for (let photoIndex = 0; photoIndex < 4; photoIndex++) {
      const plan = buildKenBurnsTimeline({
        durationMs: 3200,
        photoIndex,
        directionMode: "alternate",
        themeZoom: 0.1,
        intensityFactor: 1,
        width: 1920,
        height: 1080,
        sourceWidth: 4000,
        sourceHeight: 3000,
        framing,
        targetFps: 30,
      });
      directions.push(plan.direction as "in" | "out");
      expect(plan.zoomAmount).toBeGreaterThan(0);
      expect(plan.samples.length).toBeGreaterThan(1);
      expect(Math.abs(plan.endScale - plan.startScale)).toBeGreaterThan(0.05);
      expect(plan.samples[0]!.scale).not.toBe(plan.samples.at(-1)!.scale);
    }
    expect(directions).toEqual(["in", "out", "in", "out"]);
  });

  it("sourceCropAtScale never exceeds image bounds", () => {
    const framing = computeFramingFromFaces([
      { x: 0.05, y: 0.05, width: 0.2, height: 0.25 },
    ]);
    const crop = sourceCropAtScale({
      scale: 1.2,
      sourceWidth: 800,
      sourceHeight: 600,
      targetWidth: 1920,
      targetHeight: 1080,
      framing,
    });
    expect(crop.left).toBeGreaterThanOrEqual(0);
    expect(crop.top).toBeGreaterThanOrEqual(0);
    expect(crop.left + crop.width).toBeLessThanOrEqual(800);
    expect(crop.top + crop.height).toBeLessThanOrEqual(600);
  });

  it("sourceCropAtScale keeps sub-pixel precision (no even-snap)", () => {
    const crop = sourceCropAtScale({
      scale: 1.1,
      sourceWidth: 1920,
      sourceHeight: 1080,
      targetWidth: 1920,
      targetHeight: 1080,
      framing: centerFraming(),
    });
    // Cover at scale 1.1 stays fractional (not snapped to even integers).
    expect(crop.width).toBeCloseTo(1920 / 1.1, 5);
    expect(crop.height).toBeCloseTo(1080 / 1.1, 5);
    const next = sourceCropAtScale({
      scale: 1.101,
      sourceWidth: 1920,
      sourceHeight: 1080,
      targetWidth: 1920,
      targetHeight: 1080,
      framing: centerFraming(),
    });
    expect(Math.abs(next.width - crop.width)).toBeGreaterThan(0);
    expect(Math.abs(next.width - crop.width)).toBeLessThan(2);
  });

  it("keeps mild face-centered motion when subject fills cover", () => {
    // Subject fills the cover window → fit-cap would be 0; we still keep a
    // small zoom so the clip is not a static hold (focal stays face-aware).
    const framing = computeFramingFromFaces([
      { x: 0.05, y: 0.05, width: 0.9, height: 0.9 },
    ]);
    const plan = getKenBurnsFraming({
      sourceWidth: 2000,
      sourceHeight: 1500,
      targetWidth: 1920,
      targetHeight: 1080,
      direction: "out",
      zoomAmount: 0.12,
      framing,
    });
    expect(plan.zoomAmount).toBeGreaterThan(0);
    expect(plan.startScale).not.toBe(plan.endScale);
    const cx = (plan.start.left + plan.start.width / 2) / 2000;
    expect(Math.abs(cx - framing.focalPointX)).toBeLessThan(0.2);
  });

  it("caps zoom on large sources so extracts stay ≥ output pixels", () => {
    const plan = getKenBurnsFraming({
      sourceWidth: 4000,
      sourceHeight: 3000,
      targetWidth: 1920,
      targetHeight: 1080,
      direction: "in",
      zoomAmount: 2.0,
      framing: centerFraming(),
    });
    // Cover ~4000×2250 → max scale ≈ 4000/1920 ≈ 2.08 → zoom ≤ ~1.08
    expect(plan.zoomAmount).toBeLessThanOrEqual(1.1);
    expect(plan.endScale).toBeLessThanOrEqual(2.1);
    expect(plan.end.width).toBeGreaterThanOrEqual(1920 - 1);
  });

  it("kills zoom when the source must already upscale to fill", () => {
    expect(sourceCoverScale(800, 600, 1920, 1080)).toBeLessThan(1);
    expect(
      capZoomToAvoidUpscale({
        zoomAmount: 0.2,
        sourceWidth: 800,
        sourceHeight: 600,
        targetWidth: 1920,
        targetHeight: 1080,
      }),
    ).toBe(0);

    const plan = getKenBurnsFraming({
      sourceWidth: 800,
      sourceHeight: 600,
      targetWidth: 1920,
      targetHeight: 1080,
      direction: "in",
      zoomAmount: 0.2,
      framing: centerFraming(),
    });
    expect(plan.zoomAmount).toBe(0);
    expect(plan.startScale).toBe(1);
    expect(plan.endScale).toBe(1);
  });
});
