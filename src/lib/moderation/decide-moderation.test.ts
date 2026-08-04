import { describe, expect, it } from "vitest";
import {
  DEFAULT_MODERATION_THRESHOLDS,
  decideModerationStatus,
  type PipelineScanResults,
} from "@/lib/moderation/service";

function scan(
  overrides: {
    photodnaMatch?: boolean;
    csam?: number;
    nudity?: number;
    violence?: number;
  } = {},
): PipelineScanResults {
  return {
    photodna: {
      match: overrides.photodnaMatch ?? false,
      provider: "test",
    },
    ai: {
      csamScore: overrides.csam ?? 0,
      nudityScore: overrides.nudity ?? 0,
      violenceScore: overrides.violence ?? 0,
      provider: "test",
    },
  };
}

const thresholds = { ...DEFAULT_MODERATION_THRESHOLDS };

describe("decideModerationStatus", () => {
  it("quarantines on PhotoDNA match regardless of AI scores", () => {
    const decision = decideModerationStatus(
      scan({ photodnaMatch: true, csam: 0, nudity: 0, violence: 0 }),
      thresholds,
    );
    expect(decision.status).toBe("csam_quarantined");
  });

  it("quarantines on high AI CSAM score", () => {
    const decision = decideModerationStatus(
      scan({ csam: thresholds.aiCsamQuarantine }),
      thresholds,
    );
    expect(decision.status).toBe("csam_quarantined");
  });

  it("sends borderline CSAM to human review", () => {
    const decision = decideModerationStatus(
      scan({ csam: thresholds.aiCsamReview }),
      thresholds,
    );
    expect(decision.status).toBe("needs_human_review");
  });

  it("rejects extreme violence and reviews mid-band violence", () => {
    expect(
      decideModerationStatus(scan({ violence: thresholds.aiViolenceReject }), thresholds)
        .status,
    ).toBe("rejected");
    expect(
      decideModerationStatus(scan({ violence: thresholds.aiViolenceReview }), thresholds)
        .status,
    ).toBe("needs_human_review");
  });

  it("marks clear adult content as adult by default policy", () => {
    const decision = decideModerationStatus(
      scan({ nudity: thresholds.aiNudityAdult }),
      { ...thresholds, adultPolicy: "adult" },
    );
    expect(decision.status).toBe("adult");
  });

  it("can reject clear adult content when policy is rejected", () => {
    const decision = decideModerationStatus(
      scan({ nudity: thresholds.aiNudityAdult }),
      { ...thresholds, adultPolicy: "rejected" },
    );
    expect(decision.status).toBe("rejected");
  });

  it("rejects extreme nudity", () => {
    const decision = decideModerationStatus(
      scan({ nudity: thresholds.aiNudityReject }),
      thresholds,
    );
    expect(decision.status).toBe("rejected");
  });

  it("returns clean when all scores are below review bands", () => {
    const decision = decideModerationStatus(
      scan({ csam: 0.1, nudity: 0.1, violence: 0.1 }),
      thresholds,
    );
    expect(decision.status).toBe("clean");
  });
});
