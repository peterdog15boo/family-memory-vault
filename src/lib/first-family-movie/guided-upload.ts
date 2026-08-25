/**
 * Pure helpers for the First Family Movie guided upload step.
 */

export const FFM_SOFT_MIN_PHOTOS = 5;
export const FFM_SOFT_TARGET_PHOTOS = 10;

/** Brief pause after the 5th upload so a multi-select batch can finish. */
export const FFM_AUTO_START_SETTLE_MS = 1_400;

export type GuidedUploadProgressCopy = {
  /** Primary progress line, e.g. “3 of 5 photos added…” */
  progressLine: string;
  /** Short encouragement under the progress line. */
  encouragement: string;
  /** Whether the soft minimum is met (auto-start may proceed). */
  canContinue: boolean;
};

const ENCOURAGEMENT_BY_COUNT: Record<number, string> = {
  1: "Beautiful start — a few more will make this sing.",
  2: "Lovely. Keep going; we’re building something warm.",
  3: "You’re halfway there. These already feel like home.",
  4: "One more and we can start shaping your movie.",
};

/**
 * Progress + encouragement for the soft 5-photo minimum (more than 5 allowed).
 */
export function getGuidedUploadProgressCopy(
  successfulCount: number,
  softMin: number = FFM_SOFT_MIN_PHOTOS,
): GuidedUploadProgressCopy {
  const n = Math.max(0, Math.floor(successfulCount));
  const canContinue = n >= softMin;

  if (n === 0) {
    return {
      progressLine: `Add at least ${softMin} photos to begin`,
      encouragement: "Favorites work best — candid, smiling, everyday moments.",
      canContinue,
    };
  }

  if (n < softMin) {
    return {
      progressLine: `${n} of ${softMin} photos added…`,
      encouragement:
        ENCOURAGEMENT_BY_COUNT[n] ??
        "Keep going — a few more make a lovely movie.",
      canContinue,
    };
  }

  if (n === softMin) {
    return {
      progressLine: `${n} photos ready`,
      encouragement:
        "Perfect — that’s enough. We’ll start your movie automatically.",
      canContinue,
    };
  }

  return {
    progressLine: `${n} photos ready`,
    encouragement:
      "Wonderful collection. We’ll start your movie as soon as uploads finish.",
    canContinue,
  };
}

const PROCESSING_LINES = [
  "Looking for people…",
  "Detecting faces…",
  "Checking each photo…",
  "Almost ready…",
] as const;

/** Rotate subtle processing micro-copy while moderation / faces run. */
export function getProcessingMicroCopy(tick: number): string {
  const i = ((tick % PROCESSING_LINES.length) + PROCESSING_LINES.length) % PROCESSING_LINES.length;
  return PROCESSING_LINES[i]!;
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  // iPhone Camera Roll sometimes omits MIME; trust common extensions.
  return /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i.test(file.name);
}
