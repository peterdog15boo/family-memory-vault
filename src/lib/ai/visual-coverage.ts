/**
 * Detect when object/scene search may fail because visual labels are sparse.
 *
 * Object search depends on ai_tags / ai_objects / ai_scenes (and captions).
 * When the library has many clean photos but few labeled rows, Ask AI should
 * explain analysis coverage — without blocking the query or routing to People.
 */

export type VisualCoverageAssessment = {
  cleanReadyTotal: number;
  visualLabeledTotal: number;
  visualUnlabeledTotal: number;
  /** labeled / clean, or 0 when library empty. */
  labeledRatio: number;
  /**
   * True when the library is large enough to search, but label coverage is
   * too thin for reliable object/scene matching.
   */
  lowCoverage: boolean;
  /** Human-readable coverage line for replies. */
  coverageNote: string | null;
};

/** Minimum clean/ready items before we call coverage "many photos". */
export const VISUAL_COVERAGE_MANY_CLEAN_MIN = 10;

/**
 * Labeled share below this (with many clean) → low coverage.
 * Example: 2 labeled of 20 clean = 0.10 → low.
 */
export const VISUAL_COVERAGE_LOW_RATIO = 0.25;

export function assessVisualLabelCoverage(input: {
  cleanReadyTotal: number;
  visualLabeledTotal: number;
  visualUnlabeledTotal?: number;
}): VisualCoverageAssessment {
  const cleanReadyTotal = Math.max(0, Math.floor(input.cleanReadyTotal));
  const visualLabeledTotal = Math.max(
    0,
    Math.min(cleanReadyTotal, Math.floor(input.visualLabeledTotal)),
  );
  const visualUnlabeledTotal =
    input.visualUnlabeledTotal != null
      ? Math.max(0, Math.floor(input.visualUnlabeledTotal))
      : Math.max(0, cleanReadyTotal - visualLabeledTotal);

  const labeledRatio =
    cleanReadyTotal > 0 ? visualLabeledTotal / cleanReadyTotal : 0;

  const lowCoverage =
    cleanReadyTotal >= VISUAL_COVERAGE_MANY_CLEAN_MIN &&
    labeledRatio < VISUAL_COVERAGE_LOW_RATIO;

  const coverageNote = lowCoverage
    ? `Only ${visualLabeledTotal} of ${cleanReadyTotal} clean photos have object/scene labels so far.`
    : null;

  return {
    cleanReadyTotal,
    visualLabeledTotal,
    visualUnlabeledTotal,
    labeledRatio,
    lowCoverage,
    coverageNote,
  };
}

/** Shown in Ask AI empty replies when NODE_ENV is development (or callers opt in). */
export function visualCoverageAdminEnqueueHint(): string {
  return "Admin/dev: enqueue scene analysis with POST /api/admin/media/enqueue-scene-analysis (or POST /api/admin/media/[id]/reanalyze-vision per item).";
}

export function shouldIncludeVisualCoverageAdminHint(
  explicit?: boolean,
): boolean {
  if (explicit === true) return true;
  if (explicit === false) return false;
  return process.env.NODE_ENV === "development";
}
