/**
 * Temporary face-framing debug for movie Ken Burns (log-only, never draws).
 * Enable with MOVIE_FACE_DEBUG=1. Safe in production — no overlays.
 */

import type { KenBurnsSourceCrop, MediaFraming } from "@/lib/movies/framing";

export function isMovieFaceDebugEnabled(): boolean {
  const v = process.env.MOVIE_FACE_DEBUG?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function cropCenterNormalized(
  crop: KenBurnsSourceCrop,
  sourceWidth: number,
  sourceHeight: number,
): { x: number; y: number } {
  const sw = Math.max(1, sourceWidth);
  const sh = Math.max(1, sourceHeight);
  return {
    x: (crop.left + crop.width / 2) / sw,
    y: (crop.top + crop.height / 2) / sh,
  };
}

/** Summarize how tightly crop centers track the face focal point. */
export function summarizeCropFocalTracking(input: {
  crops: KenBurnsSourceCrop[];
  framing: MediaFraming;
  sourceWidth: number;
  sourceHeight: number;
}): {
  sampleCount: number;
  meanAbsDx: number;
  meanAbsDy: number;
  maxAbsDx: number;
  maxAbsDy: number;
  firstCenter: { x: number; y: number };
  lastCenter: { x: number; y: number };
} {
  const fx = input.framing.focalPointX;
  const fy = input.framing.focalPointY;
  let sumDx = 0;
  let sumDy = 0;
  let maxDx = 0;
  let maxDy = 0;
  const centers = input.crops.map((c) =>
    cropCenterNormalized(c, input.sourceWidth, input.sourceHeight),
  );
  for (const c of centers) {
    const dx = Math.abs(c.x - fx);
    const dy = Math.abs(c.y - fy);
    sumDx += dx;
    sumDy += dy;
    maxDx = Math.max(maxDx, dx);
    maxDy = Math.max(maxDy, dy);
  }
  const n = Math.max(1, centers.length);
  return {
    sampleCount: centers.length,
    meanAbsDx: sumDx / n,
    meanAbsDy: sumDy / n,
    maxAbsDx: maxDx,
    maxAbsDy: maxDy,
    firstCenter: centers[0] ?? { x: fx, y: fy },
    lastCenter: centers.at(-1) ?? { x: fx, y: fy },
  };
}

/**
 * Log face-aware Ken Burns crop tracking for one clip.
 * Always emits a compact summary; per-sample lines only when debug is on.
 */
export function logKenBurnsFaceFocus(input: {
  mediaId: string;
  framing: MediaFraming;
  sourceWidth: number;
  sourceHeight: number;
  direction: string;
  zoomAmount: number;
  crops: KenBurnsSourceCrop[];
}): void {
  const faceDataPresent =
    input.framing.source === "faces" &&
    Boolean(input.framing.subjectBounds?.faceCount);

  const summary = summarizeCropFocalTracking({
    crops: input.crops,
    framing: input.framing,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
  });

  console.info("[movies.face-debug] clip", {
    mediaId: input.mediaId,
    faceDataPresent,
    framingSource: input.framing.source,
    focalPoint: {
      x: Number(input.framing.focalPointX.toFixed(4)),
      y: Number(input.framing.focalPointY.toFixed(4)),
    },
    subjectBounds: input.framing.subjectBounds
      ? {
          x: Number(input.framing.subjectBounds.x.toFixed(4)),
          y: Number(input.framing.subjectBounds.y.toFixed(4)),
          w: Number(input.framing.subjectBounds.width.toFixed(4)),
          h: Number(input.framing.subjectBounds.height.toFixed(4)),
          faceCount: input.framing.subjectBounds.faceCount,
        }
      : null,
    direction: input.direction,
    zoomAmount: Number(input.zoomAmount.toFixed(4)),
    cropRectSequence: {
      sampleCount: summary.sampleCount,
      firstCenter: {
        x: Number(summary.firstCenter.x.toFixed(4)),
        y: Number(summary.firstCenter.y.toFixed(4)),
      },
      lastCenter: {
        x: Number(summary.lastCenter.x.toFixed(4)),
        y: Number(summary.lastCenter.y.toFixed(4)),
      },
      meanAbsDeltaToFocal: {
        x: Number(summary.meanAbsDx.toFixed(4)),
        y: Number(summary.meanAbsDy.toFixed(4)),
      },
      maxAbsDeltaToFocal: {
        x: Number(summary.maxAbsDx.toFixed(4)),
        y: Number(summary.maxAbsDy.toFixed(4)),
      },
    },
  });

  if (!isMovieFaceDebugEnabled()) return;

  for (let i = 0; i < input.crops.length; i++) {
    const crop = input.crops[i]!;
    const center = cropCenterNormalized(
      crop,
      input.sourceWidth,
      input.sourceHeight,
    );
    console.info("[movies.face-debug] sample", {
      mediaId: input.mediaId,
      sample: i,
      scale: Number(crop.scale.toFixed(4)),
      crop: {
        left: Number(crop.left.toFixed(2)),
        top: Number(crop.top.toFixed(2)),
        width: Number(crop.width.toFixed(2)),
        height: Number(crop.height.toFixed(2)),
      },
      cropCenter: {
        x: Number(center.x.toFixed(4)),
        y: Number(center.y.toFixed(4)),
      },
      focalPoint: {
        x: Number(input.framing.focalPointX.toFixed(4)),
        y: Number(input.framing.focalPointY.toFixed(4)),
      },
      deltaToFocal: {
        x: Number((center.x - input.framing.focalPointX).toFixed(4)),
        y: Number((center.y - input.framing.focalPointY).toFixed(4)),
      },
    });
  }
}
