import { describe, expect, it } from "vitest";
import {
  assessVisualLabelCoverage,
  VISUAL_COVERAGE_MANY_CLEAN_MIN,
  VISUAL_COVERAGE_LOW_RATIO,
} from "@/lib/ai/visual-coverage";

describe("assessVisualLabelCoverage", () => {
  it("flags low coverage when many clean photos have few labels", () => {
    const assessment = assessVisualLabelCoverage({
      cleanReadyTotal: 40,
      visualLabeledTotal: 3,
      visualUnlabeledTotal: 37,
    });
    expect(assessment.lowCoverage).toBe(true);
    expect(assessment.labeledRatio).toBeLessThan(VISUAL_COVERAGE_LOW_RATIO);
    expect(assessment.coverageNote).toMatch(/Only 3 of 40/);
  });

  it("does not flag small libraries", () => {
    const assessment = assessVisualLabelCoverage({
      cleanReadyTotal: VISUAL_COVERAGE_MANY_CLEAN_MIN - 1,
      visualLabeledTotal: 0,
    });
    expect(assessment.lowCoverage).toBe(false);
  });

  it("does not flag well-labeled libraries", () => {
    const assessment = assessVisualLabelCoverage({
      cleanReadyTotal: 40,
      visualLabeledTotal: 30,
    });
    expect(assessment.lowCoverage).toBe(false);
    expect(assessment.coverageNote).toBeNull();
  });
});
