/**
 * Ken Burns / zoom motion math for the movie frame renderer.
 *
 * Zoom progress is duration-driven over a motion span that can include the
 * lead-in / trail-out crossfade windows:
 *   - t = 0 → zoom start (progress 0)
 *   - t = motion duration → zoom end (progress 1)
 * Solo clip holds use the middle window; trail/lead samples are composited
 * during transitions so zoom never freezes for a dissolve.
 *
 * Sample count only affects smoothness (unique crops / sec), never how long
 * the zoom lasts — there is no fixed zoom length, delayed start, or early end.
 *
 * When source dimensions + MediaFraming are provided, crops are resolved in
 * source-image space around a face-aware focal point (see framing.ts).
 * Otherwise the legacy cover+extract path (output-space pan) is used.
 *
 * Frames are sharp-rendered JPEGs encoded with ffmpeg concat (server-side).
 */

import {
  getKenBurnsFraming,
  interpolateSourceCrop,
  resolveKenBurnsScaleRange,
  type KenBurnsSourceCrop,
  type MediaFraming,
} from "@/lib/movies/framing";

export type ZoomDirectionMode =
  | "alternate"
  | "always-in"
  | "always-out"
  | "off";

export type ZoomDirection = "in" | "out" | "none";

export type KenBurnsSample = {
  /**
   * Linear progress 0→1 across the clip wall-clock
   * (0 at start, 1 at end). Easing is applied in kenBurnsCrop.
   */
  progress: number;
  /** Elapsed ms at this sample (start of its hold). */
  elapsedMs: number;
  /** How long this sample is held on screen. */
  holdMs: number;
  direction: ZoomDirection;
  /** Absolute scale applied (≥ 1). */
  scale: number;
  /**
   * Legacy output-space crop origin (when source extract is unavailable).
   * Prefer `sourceCrop` when present.
   */
  left: number;
  top: number;
  frameW: number;
  frameH: number;
  /** Face-aware extract from the oriented source image. */
  sourceCrop: KenBurnsSourceCrop | null;
};

/** Cubic ease-in-out — used by transitions; too flat at ends for Ken Burns. */
export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Cinematic Ken Burns ease: continuous motion from the first frame through
 * the last. Sine ease-in-out keeps polish without cubic's long flat start/end
 * that reads as a delayed zoom and early finish.
 */
export function easeKenBurns(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
}

/**
 * Linear zoom progress for a point in a clip.
 * Tied only to elapsed time / clip duration — never a global fixed length.
 */
export function clipZoomLinearProgress(
  elapsedMs: number,
  durationMs: number,
): number {
  if (durationMs <= 0) return 1;
  return Math.min(1, Math.max(0, elapsedMs / durationMs));
}

export function resolveZoomDirection(
  mode: ZoomDirectionMode,
  photoIndex: number,
): ZoomDirection {
  switch (mode) {
    case "off":
      return "none";
    case "always-in":
      return "in";
    case "always-out":
      return "out";
    case "alternate":
    default:
      return photoIndex % 2 === 0 ? "in" : "out";
  }
}

/**
 * How many discrete samples to render for a continuous zoom over `durationMs`.
 *
 * Always ≥ encode fps so each output frame can receive a unique crop (holds
 * never span multiple video frames). Gentle zooms oversample so consecutive
 * JPEG crops move by sub-pixel amounts — reduces stair-step when concat
 * timing / fps resampling lands between samples.
 */
export function resolveKenBurnsSampleCount(input: {
  durationMs: number;
  zoomAmount: number;
  fast?: boolean;
  /** Preferred unique crops per second (defaults to encode fps). */
  targetFps?: number;
  /** Subtle intensity → denser samples for the same physical zoom span. */
  intensityFactor?: number;
  /**
   * @deprecated Ignored for timing. Kept so older call sites compile.
   * Zoom duration is always the clip duration.
   */
  baselineFrames?: number;
  /** Optional encode cost ceiling. Does not change zoom duration. */
  maxSamples?: number;
}): number {
  if (input.zoomAmount <= 0) return 1;

  const durationMs = Math.max(1, input.durationMs);
  const seconds = durationMs / 1000;
  const baseFps = Math.max(1, input.targetFps ?? (input.fast ? 30 : 30));

  // Floor: one unique crop per encode frame (no multi-frame holds).
  let densityMult = 1;
  if (input.fast) {
    // Match encode fps exactly — Railway RAM; still continuous at 30fps.
    densityMult = 1;
  } else if (input.zoomAmount <= 0.06) {
    densityMult = 3;
  } else if (input.zoomAmount <= 0.12) {
    densityMult = 2;
  } else {
    densityMult = 1.5;
  }
  if (!input.fast && (input.intensityFactor ?? 1) <= 0.65) {
    densityMult = Math.max(densityMult, 2.5);
  }

  const fromFps = Math.ceil(seconds * baseFps);
  const fromDensity = Math.round(seconds * baseFps * densityMult);
  const fromDuration = Math.max(fromFps, fromDensity);
  const maxSamples =
    input.maxSamples ??
    (input.fast
      ? Math.max(fromFps + 2, Math.ceil(seconds * baseFps * 1.05) + 2)
      : Math.max(480, Math.ceil(seconds * baseFps * densityMult) + 2));
  // At least 2 samples so start (0%) and end (100%) are distinct.
  return Math.max(2, Math.min(fromDuration, maxSamples));
}

/**
 * Map intensity label / numeric zoom amount.
 * `zoomAmount` is the extra scale beyond 1.0 (e.g. 0.15 → 1.00…1.15).
 * Intensity only changes how far we zoom — never how long.
 */
export function resolveZoomAmount(input: {
  themeZoom: number;
  intensityFactor: number;
  direction: ZoomDirection;
}): number {
  if (input.direction === "none" || input.intensityFactor <= 0) return 0;
  return Math.max(0, input.themeZoom) * input.intensityFactor;
}

export type KenBurnsCropResult = {
  scale: number;
  left: number;
  top: number;
  frameW: number;
  frameH: number;
  sourceCrop: KenBurnsSourceCrop | null;
};

/**
 * Compute crop window for one sample.
 * `progress` is linear 0→1 over the clip; cinematic easing is applied here.
 *
 * Pass `sourceWidth`/`sourceHeight` + optional `framing` for face-aware
 * source extracts. Without source dims, falls back to output-space pan.
 *
 * Face-aware path lerps start→end crops (from getKenBurnsFraming) so pan/zoom
 * stay continuous — recomputing placeCropAroundFocal every sample caused
 * clamp-boundary jumps mid-zoom.
 */
export function kenBurnsCrop(input: {
  progress: number;
  direction: ZoomDirection;
  zoomAmount: number;
  width: number;
  height: number;
  sourceWidth?: number;
  sourceHeight?: number;
  framing?: MediaFraming | null;
}): KenBurnsCropResult {
  const eased = easeKenBurns(input.progress);

  if (
    input.sourceWidth &&
    input.sourceHeight &&
    input.sourceWidth > 0 &&
    input.sourceHeight > 0
  ) {
    const plan = getKenBurnsFraming({
      sourceWidth: input.sourceWidth,
      sourceHeight: input.sourceHeight,
      targetWidth: input.width,
      targetHeight: input.height,
      direction: input.direction,
      zoomAmount: input.zoomAmount,
      framing: input.framing,
    });
    const sourceCrop = interpolateSourceCrop(
      plan.start,
      plan.end,
      eased,
      input.sourceWidth,
      input.sourceHeight,
    );

    return {
      scale: sourceCrop.scale,
      left: 0,
      top: 0,
      frameW: input.width,
      frameH: input.height,
      sourceCrop,
    };
  }

  // Legacy output-space path (tests / callers without source metrics).
  const { startScale, endScale } = resolveKenBurnsScaleRange(
    input.direction,
    Math.max(0, input.zoomAmount),
  );
  const scale = startScale + (endScale - startScale) * eased;

  // Keep float pan origins — integer snap here stair-steps slow zooms.
  const frameW = Math.max(input.width, input.width * scale);
  const frameH = Math.max(input.height, input.height * scale);
  const maxLeft = Math.max(0, frameW - input.width);
  const maxTop = Math.max(0, frameH - input.height);

  const panSign = input.direction === "out" ? -1 : 1;
  const pan = eased * panSign;
  const left = Math.min(
    maxLeft,
    Math.max(0, maxLeft / 2 + pan * maxLeft * 0.18),
  );
  const top = Math.min(
    maxTop,
    Math.max(0, maxTop / 2 - pan * maxTop * 0.14),
  );

  return { scale, left, top, frameW, frameH, sourceCrop: null };
}

export type KenBurnsClipPlan = {
  direction: ZoomDirection;
  zoomAmount: number;
  startScale: number;
  endScale: number;
  samples: KenBurnsSample[];
  framing: MediaFraming | null;
};

/**
 * Plan Ken Burns samples for one photo clip.
 * Progress is always 0 at t=0 and 1 at t=durationMs, regardless of pacing.
 */
export function buildKenBurnsTimeline(input: {
  durationMs: number;
  photoIndex: number;
  directionMode: ZoomDirectionMode;
  themeZoom: number;
  intensityFactor: number;
  width: number;
  height: number;
  fast?: boolean;
  /** Unique crops/sec — pass encode fps so motion matches the final video. */
  targetFps?: number;
  baselineFrames?: number;
  maxSamples?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  framing?: MediaFraming | null;
}): KenBurnsClipPlan {
  const direction = resolveZoomDirection(input.directionMode, input.photoIndex);
  let zoomAmount = resolveZoomAmount({
    themeZoom: input.themeZoom,
    intensityFactor: input.intensityFactor,
    direction,
  });

  // Apply face-aware zoom caps early so sample count matches final motion.
  let startScale = 1;
  let endScale = 1;
  if (
    input.sourceWidth &&
    input.sourceHeight &&
    (input.framing || zoomAmount > 0)
  ) {
    const planned = getKenBurnsFraming({
      sourceWidth: input.sourceWidth,
      sourceHeight: input.sourceHeight,
      targetWidth: input.width,
      targetHeight: input.height,
      direction,
      zoomAmount,
      framing: input.framing,
    });
    zoomAmount = planned.zoomAmount;
    startScale = planned.startScale;
    endScale = planned.endScale;
  } else {
    const range = resolveKenBurnsScaleRange(direction, zoomAmount);
    startScale = range.startScale;
    endScale = range.endScale;
  }

  const durationMs = Math.max(1, Math.round(input.durationMs));
  const count = resolveKenBurnsSampleCount({
    durationMs,
    zoomAmount,
    fast: input.fast,
    targetFps: input.targetFps,
    intensityFactor: input.intensityFactor,
    baselineFrames: input.baselineFrames,
    maxSamples: input.maxSamples,
  });

  const framing = input.framing ?? null;

  if (zoomAmount <= 0 || count <= 1 || direction === "none") {
    const crop = kenBurnsCrop({
      progress: 0,
      direction,
      zoomAmount: 0,
      width: input.width,
      height: input.height,
      sourceWidth: input.sourceWidth,
      sourceHeight: input.sourceHeight,
      framing,
    });
    return {
      direction,
      zoomAmount: 0,
      startScale: 1,
      endScale: 1,
      framing,
      samples: [
        {
          progress: 0,
          elapsedMs: 0,
          holdMs: durationMs,
          direction,
          scale: crop.scale,
          left: crop.left,
          top: crop.top,
          frameW: crop.frameW,
          frameH: crop.frameH,
          sourceCrop: crop.sourceCrop,
        },
      ],
    };
  }

  const holds = splitDurationMs(durationMs, count);
  const samples: KenBurnsSample[] = [];
  let elapsedMs = 0;

  for (let k = 0; k < count; k++) {
    // Evenly space progress 0→1 inclusive so zoom starts on the first frame
    // and completes on the last; holds still sum to the full clip duration.
    const progress = count === 1 ? 0 : k / (count - 1);
    const crop = kenBurnsCrop({
      progress,
      direction,
      zoomAmount,
      width: input.width,
      height: input.height,
      sourceWidth: input.sourceWidth,
      sourceHeight: input.sourceHeight,
      framing,
    });
    samples.push({
      progress,
      elapsedMs,
      holdMs: holds[k]!,
      direction,
      scale: crop.scale,
      left: crop.left,
      top: crop.top,
      frameW: crop.frameW,
      frameH: crop.frameH,
      sourceCrop: crop.sourceCrop,
    });
    elapsedMs += holds[k]!;
  }

  return {
    direction,
    zoomAmount,
    startScale,
    endScale,
    framing,
    samples,
  };
}

/**
 * Full Ken Burns wall-clock span including crossfade lead/trail so zoom
 * continues through dissolves (outgoing finishes during T; incoming starts).
 */
export function kenBurnsMotionDurationMs(input: {
  clipDurationMs: number;
  leadTransitionMs?: number;
  trailTransitionMs?: number;
}): number {
  return Math.max(
    1,
    Math.round(input.clipDurationMs) +
      Math.max(0, Math.round(input.leadTransitionMs ?? 0)) +
      Math.max(0, Math.round(input.trailTransitionMs ?? 0)),
  );
}

/**
 * Linear zoom progress for each side of a crossfade at transition parameter u
 * (typically {@link transitionSampleProgress}, exclusive of exact 0/1).
 */
export function kenBurnsCrossfadeProgress(input: {
  transitionU: number;
  outgoing: {
    leadMs: number;
    clipDurationMs: number;
    trailMs: number;
  };
  incoming: {
    leadMs: number;
    clipDurationMs: number;
    trailMs: number;
  };
}): { fromProgress: number; toProgress: number } {
  const u = Math.min(1, Math.max(0, input.transitionU));
  const outMotion = kenBurnsMotionDurationMs({
    clipDurationMs: input.outgoing.clipDurationMs,
    leadTransitionMs: input.outgoing.leadMs,
    trailTransitionMs: input.outgoing.trailMs,
  });
  const inMotion = kenBurnsMotionDurationMs({
    clipDurationMs: input.incoming.clipDurationMs,
    leadTransitionMs: input.incoming.leadMs,
    trailTransitionMs: input.incoming.trailMs,
  });
  const fromElapsed =
    input.outgoing.leadMs +
    input.outgoing.clipDurationMs +
    u * input.outgoing.trailMs;
  const toElapsed = u * input.incoming.leadMs;
  return {
    fromProgress: clipZoomLinearProgress(fromElapsed, outMotion),
    toProgress: clipZoomLinearProgress(toElapsed, inMotion),
  };
}

/**
 * Keep samples whose holds overlap [rangeStartMs, rangeEndMs), trimming holds
 * to the window. Used to emit solo photo frames without the lead/trail used
 * only inside transitions.
 */
export function sliceKenBurnsSamplesByTime(
  samples: readonly KenBurnsSample[],
  rangeStartMs: number,
  rangeEndMs: number,
): KenBurnsSample[] {
  const start = Math.max(0, Math.round(rangeStartMs));
  const end = Math.max(start, Math.round(rangeEndMs));
  const out: KenBurnsSample[] = [];
  for (const sample of samples) {
    const s0 = sample.elapsedMs;
    const s1 = sample.elapsedMs + sample.holdMs;
    const a = Math.max(s0, start);
    const b = Math.min(s1, end);
    if (b > a) {
      out.push({
        ...sample,
        elapsedMs: a,
        holdMs: b - a,
      });
    }
  }
  return out;
}

/** Split duration evenly across N samples (holds differ by at most 1ms). Sum === totalMs. */
export function splitDurationMs(totalMs: number, count: number): number[] {
  const n = Math.max(1, count);
  const safeTotal = Math.max(n, Math.round(totalMs));
  const base = Math.floor(safeTotal / n);
  let rem = safeTotal - base * n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    // Spread remainder across early samples so the last hold is not a long stall.
    const hold = base + (rem > 0 ? 1 : 0);
    out.push(Math.max(1, hold));
    if (rem > 0) rem -= 1;
  }
  return out;
}
