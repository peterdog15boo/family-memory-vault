/**
 * Moderation pipeline service.
 *
 * Orchestrates PhotoDNA hash matching + AI content scoring (in parallel) →
 * decision → DB updates → quarantine + NCMEC escalation when CSAM is detected.
 *
 * Real vendor APIs are used when enabled; otherwise local mocks keep the flow
 * testable (`MODERATION_MOCK_SCENARIO`).
 *
 * Test scenarios (optional): see `mock-scenario.ts` /
 * `MODERATION_MOCK_SCENARIO` and `MODERATION_FORCE_STATUS` in SAFETY.md.
 */

import type { Media } from "@/lib/db/schema";
import { updateMediaModerationStatus } from "@/lib/moderation/db";
import { resolveForcedModerationStatus } from "@/lib/moderation/mock-scenario";
import { reportCsamIncidentForMedia } from "@/lib/moderation/ncmec";
import {
  aiResultToModerationLabels,
  isAiModerationEnabled,
  moderateWithAi,
  type AiModerationProviderResult,
} from "@/lib/moderation/providers/ai-moderation";
import {
  isPhotoDnaEnabled,
  matchWithPhotoDna,
} from "@/lib/moderation/providers/photodna";
import type {
  ModerationResult,
  ModerationStatus,
} from "@/lib/moderation/types";
import { getObjectBytes } from "@/lib/r2";

// ---------------------------------------------------------------------------
// Pipeline step result types
// ---------------------------------------------------------------------------

export type PhotoDnaCheckResult = {
  match: boolean;
  /** Vendor match confidence / distance when available */
  confidence?: number | null;
  provider: string;
  /** Opaque vendor payload for audit — never store illegal imagery */
  raw?: Record<string, unknown>;
  notes?: string;
};

export type AiModerationCheckResult = {
  /** CSAM risk score in [0, 1] */
  csamScore: number;
  /** Nudity / adult content score in [0, 1] */
  nudityScore: number;
  /** Violence / graphic content score in [0, 1] */
  violenceScore?: number;
  labels?: ModerationResult["labels"];
  provider: string;
  raw?: Record<string, unknown>;
  notes?: string;
};

export type PipelineScanResults = {
  photodna: PhotoDnaCheckResult;
  ai: AiModerationCheckResult;
};

export type ModerationDecision = {
  status: ModerationStatus;
  result: ModerationResult;
  /** Human-readable reason for the decision (logged / audited). */
  reason: string;
};

export type ProcessMediaModerationOutcome = {
  media: Media;
  decision: ModerationDecision;
  ncmecReportId?: string;
};

function mapAiProviderResult(
  result: AiModerationProviderResult,
): AiModerationCheckResult {
  return {
    csamScore: result.csamScore,
    nudityScore: result.nudityScore,
    violenceScore: result.violenceScore,
    labels: aiResultToModerationLabels(result),
    provider: result.provider,
    raw: {
      ...(result.raw ?? {}),
      mock: result.mock,
      categories: result.categories,
      detailedLabels: result.detailedLabels,
    },
    notes: result.notes,
  };
}

export type ScanInput = {
  key: string;
  buffer?: Buffer;
  contentType?: string;
};

// ---------------------------------------------------------------------------
// Step 1 — PhotoDNA / hash matching
// ---------------------------------------------------------------------------

/**
 * Run Microsoft PhotoDNA CSAM hash matching against the R2 object.
 *
 * Uses the real Cloud Service Match API when `PHOTODNA_ENABLED=true` and
 * credentials are present (`src/lib/moderation/providers/photodna.ts`).
 * Otherwise falls back to the local mock (honors MODERATION_MOCK_SCENARIO).
 *
 * Credentials are free for qualified orgs after applying at:
 *   https://www.microsoft.com/en-us/photodna
 *
 * @param keyOrInput - R2 object key, or key + optional preloaded buffer
 */
export async function checkWithPhotoDNA(
  keyOrInput: string | ScanInput,
): Promise<PhotoDnaCheckResult> {
  const input: ScanInput =
    typeof keyOrInput === "string" ? { key: keyOrInput } : keyOrInput;

  console.info("[moderation.service] PhotoDNA check starting", {
    key: input.key,
    live: isPhotoDnaEnabled(),
    hasBuffer: Boolean(input.buffer),
  });

  try {
    const result = await matchWithPhotoDna(
      input.buffer
        ? { buffer: input.buffer, key: input.key, contentType: input.contentType }
        : { key: input.key },
    );

    console.info("[moderation.service] PhotoDNA check finished", {
      key: input.key,
      match: result.match,
      provider: result.provider,
      mock: result.mock,
      trackingId: result.trackingId ?? null,
    });

    return {
      match: result.match,
      confidence: result.confidence,
      provider: result.provider,
      raw: {
        ...(result.raw ?? {}),
        trackingId: result.trackingId,
        statusCode: result.statusCode,
        statusDescription: result.statusDescription,
        mock: result.mock,
      },
      notes: result.notes,
    };
  } catch (error) {
    // Live PhotoDNA failures should fail the job so the queue retries —
    // do not silently treat as clean.
    console.error("[moderation.service] PhotoDNA check failed", {
      key: input.key,
      error,
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Step 2 — AI content moderation
// ---------------------------------------------------------------------------

/**
 * Run AI CSAM / nudity / policy scoring against the object.
 *
 * Provider switch: `AI_MODERATION_PROVIDER=rekognition|google_vision|hive|mock`
 * Enable with `AI_MODERATION_ENABLED=true` + provider credentials.
 * See `src/lib/moderation/providers/ai-moderation.ts`.
 *
 * @param keyOrInput - R2 object key, or key + optional preloaded buffer
 */
export async function checkWithAI(
  keyOrInput: string | ScanInput,
): Promise<AiModerationCheckResult> {
  const input: ScanInput =
    typeof keyOrInput === "string" ? { key: keyOrInput } : keyOrInput;

  console.info("[moderation.service] AI moderation starting", {
    key: input.key,
    live: isAiModerationEnabled(),
    hasBuffer: Boolean(input.buffer),
  });

  try {
    const result = await moderateWithAi(
      input.buffer
        ? { buffer: input.buffer, key: input.key, contentType: input.contentType }
        : { key: input.key },
    );
    const mapped = mapAiProviderResult(result);

    console.info("[moderation.service] AI moderation finished", {
      key: input.key,
      provider: mapped.provider,
      nudityScore: mapped.nudityScore,
      csamScore: mapped.csamScore,
      violenceScore: mapped.violenceScore,
    });

    return mapped;
  } catch (error) {
    console.error("[moderation.service] AI moderation failed", {
      key: input.key,
      error,
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Step 3 — Configurable decision engine
// ---------------------------------------------------------------------------

/**
 * Product policy when automated scores clearly indicate adult (non-CSAM) content.
 * - `adult`    → keep as moderation_status=adult (hidden from family gallery)
 * - `rejected` → treat high adult content as a hard reject
 *
 * Override with MODERATION_ADULT_POLICY=adult|rejected
 */
export type AdultContentPolicy = "adult" | "rejected";

/**
 * All decision thresholds are in [0, 1] and overridable via env.
 *
 * Safety posture: when in doubt, prefer quarantine or human review over clean.
 */
export type ModerationDecisionThresholds = {
  /**
   * AI CSAM / underage score ≥ this → csam_quarantined (auto escalate).
   * Env: MODERATION_AI_CSAM_QUARANTINE_THRESHOLD (default 0.85)
   */
  aiCsamQuarantine: number;
  /**
   * AI CSAM score in [this, quarantine) → needs_human_review.
   * Env: MODERATION_AI_CSAM_REVIEW_THRESHOLD (default 0.55)
   */
  aiCsamReview: number;
  /**
   * AI nudity ≥ this → rejected (extreme explicit content).
   * Env: MODERATION_AI_NUDITY_REJECT_THRESHOLD (default 0.95)
   */
  aiNudityReject: number;
  /**
   * AI nudity ≥ this (and below reject) → adult or rejected per adultPolicy.
   * Env: MODERATION_AI_NUDITY_ADULT_THRESHOLD (default 0.70)
   */
  aiNudityAdult: number;
  /**
   * AI nudity in [this, adult) → needs_human_review (borderline).
   * Env: MODERATION_AI_NUDITY_REVIEW_THRESHOLD (default 0.40)
   */
  aiNudityReview: number;
  /**
   * AI violence ≥ this → rejected.
   * Env: MODERATION_AI_VIOLENCE_REJECT_THRESHOLD (default 0.90)
   */
  aiViolenceReject: number;
  /**
   * AI violence in [this, reject) → needs_human_review.
   * Env: MODERATION_AI_VIOLENCE_REVIEW_THRESHOLD (default 0.55)
   */
  aiViolenceReview: number;
  /**
   * How to classify clear adult nudity (non-CSAM).
   * Env: MODERATION_ADULT_POLICY=adult|rejected (default adult)
   */
  adultPolicy: AdultContentPolicy;
};

/** Built-in defaults — conservative; tune after calibrating live models. */
export const DEFAULT_MODERATION_THRESHOLDS: ModerationDecisionThresholds = {
  aiCsamQuarantine: 0.85,
  aiCsamReview: 0.55,
  aiNudityReject: 0.95,
  aiNudityAdult: 0.7,
  aiNudityReview: 0.4,
  aiViolenceReject: 0.9,
  aiViolenceReview: 0.55,
  adultPolicy: "adult",
};

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    console.warn(
      `[moderation.service] Ignoring invalid ${name}="${raw}" (expected 0–1). Using ${fallback}.`,
    );
    return fallback;
  }
  return n;
}

/**
 * Load decision thresholds from env, falling back to DEFAULT_MODERATION_THRESHOLDS.
 * Safe to call per decision — cheap and keeps ops knobs live without redeploying code.
 */
export function getModerationDecisionThresholds(): ModerationDecisionThresholds {
  const adultRaw = process.env.MODERATION_ADULT_POLICY?.trim().toLowerCase();
  const adultPolicy: AdultContentPolicy =
    adultRaw === "rejected" ? "rejected" : "adult";

  const thresholds: ModerationDecisionThresholds = {
    aiCsamQuarantine: envNumber(
      "MODERATION_AI_CSAM_QUARANTINE_THRESHOLD",
      DEFAULT_MODERATION_THRESHOLDS.aiCsamQuarantine,
    ),
    aiCsamReview: envNumber(
      "MODERATION_AI_CSAM_REVIEW_THRESHOLD",
      DEFAULT_MODERATION_THRESHOLDS.aiCsamReview,
    ),
    aiNudityReject: envNumber(
      "MODERATION_AI_NUDITY_REJECT_THRESHOLD",
      DEFAULT_MODERATION_THRESHOLDS.aiNudityReject,
    ),
    aiNudityAdult: envNumber(
      "MODERATION_AI_NUDITY_ADULT_THRESHOLD",
      DEFAULT_MODERATION_THRESHOLDS.aiNudityAdult,
    ),
    aiNudityReview: envNumber(
      "MODERATION_AI_NUDITY_REVIEW_THRESHOLD",
      DEFAULT_MODERATION_THRESHOLDS.aiNudityReview,
    ),
    aiViolenceReject: envNumber(
      "MODERATION_AI_VIOLENCE_REJECT_THRESHOLD",
      DEFAULT_MODERATION_THRESHOLDS.aiViolenceReject,
    ),
    aiViolenceReview: envNumber(
      "MODERATION_AI_VIOLENCE_REVIEW_THRESHOLD",
      DEFAULT_MODERATION_THRESHOLDS.aiViolenceReview,
    ),
    adultPolicy,
  };

  // Keep bands ordered so misconfigured env cannot invert safety posture.
  if (thresholds.aiCsamReview > thresholds.aiCsamQuarantine) {
    thresholds.aiCsamReview = thresholds.aiCsamQuarantine;
  }
  if (thresholds.aiNudityReview > thresholds.aiNudityAdult) {
    thresholds.aiNudityReview = thresholds.aiNudityAdult;
  }
  if (thresholds.aiNudityAdult > thresholds.aiNudityReject) {
    thresholds.aiNudityAdult = thresholds.aiNudityReject;
  }
  if (thresholds.aiViolenceReview > thresholds.aiViolenceReject) {
    thresholds.aiViolenceReview = thresholds.aiViolenceReject;
  }

  return thresholds;
}

function buildDecisionPayload(
  results: PipelineScanResults,
  thresholds: ModerationDecisionThresholds,
): ModerationResult {
  const { photodna, ai } = results;
  return {
    photodnaMatch: photodna.match,
    aiCsamScore: ai.csamScore,
    aiNudityScore: ai.nudityScore,
    aiViolenceScore: ai.violenceScore ?? null,
    labels: ai.labels ?? null,
    provider: "moderation.pipeline",
    raw: {
      photodna: photodna.raw,
      ai: ai.raw,
      violenceScore: ai.violenceScore,
      thresholds,
    },
    notes: [photodna.notes, ai.notes].filter(Boolean).join(" | ") || undefined,
  };
}

/**
 * Apply a forced status (dev/staging) without calling live scanners.
 * CSAM still goes through quarantine + NCMEC path.
 */
async function applyForcedModerationStatus(
  mediaId: string,
  key: string,
  status: ModerationStatus,
): Promise<ProcessMediaModerationOutcome> {
  const result: ModerationResult = {
    photodnaMatch: status === "csam_quarantined",
    aiCsamScore: status === "csam_quarantined" ? 1 : 0,
    aiNudityScore:
      status === "adult" ? 0.85 : status === "rejected" ? 0.98 : 0,
    aiViolenceScore: 0,
    provider: "moderation.force",
    notes: `Forced via MODERATION_FORCE_STATUS=${status}`,
    raw: { forced: true, status },
  };

  const decision: ModerationDecision = {
    status,
    result,
    reason: `Forced moderation status via MODERATION_FORCE_STATUS=${status}`,
  };

  console.warn("[moderation.service] Applying forced moderation status", {
    mediaId,
    key,
    status,
  });

  if (status === "csam_quarantined") {
    const report = await reportCsamIncidentForMedia(mediaId, key, {
      detectedAt: new Date(),
      additionalInfo: decision.reason,
      moderationResult: result,
    });
    return {
      media: report.media,
      decision,
      ncmecReportId: report.reportId,
    };
  }

  const media = await updateMediaModerationStatus(mediaId, status, result);
  return { media, decision };
}

/**
 * Safety-first decision function: PhotoDNA + AI → one moderation status.
 *
 * Priority order (highest first):
 * 1. Any PhotoDNA match                         → csam_quarantined
 * 2. High AI CSAM confidence                     → csam_quarantined
 * 3. Borderline AI CSAM confidence               → needs_human_review
 * 4. Extreme violence                            → rejected
 * 5. Borderline violence                         → needs_human_review
 * 6. Extreme nudity                              → rejected
 * 7. Clear adult nudity                          → adult | rejected (policy)
 * 8. Borderline nudity                           → needs_human_review
 * 9. Otherwise                                   → clean
 *
 * Thresholds: see getModerationDecisionThresholds() / DEFAULT_MODERATION_THRESHOLDS.
 */
export function decideModerationStatus(
  results: PipelineScanResults,
  thresholdOverrides?: Partial<ModerationDecisionThresholds>,
): ModerationDecision {
  const thresholds: ModerationDecisionThresholds = {
    ...getModerationDecisionThresholds(),
    ...thresholdOverrides,
  };

  const { photodna, ai } = results;
  const csam = ai.csamScore;
  const nudity = ai.nudityScore;
  const violence = ai.violenceScore ?? 0;
  const result = buildDecisionPayload(results, thresholds);

  // -------------------------------------------------------------------------
  // 1) PhotoDNA — known CSAM hash match is authoritative.
  //    Never ask a human to "confirm" a PhotoDNA hit in the family product path;
  //    quarantine + escalate immediately.
  // -------------------------------------------------------------------------
  if (photodna.match) {
    return {
      status: "csam_quarantined",
      result,
      reason: "PhotoDNA hash match — quarantine and escalate.",
    };
  }

  // -------------------------------------------------------------------------
  // 2–3) AI CSAM / underage signals
  //    High confidence → auto quarantine.
  //    Mid / ambiguous band → human review (prefer review over false clean).
  // -------------------------------------------------------------------------
  if (csam >= thresholds.aiCsamQuarantine) {
    return {
      status: "csam_quarantined",
      result,
      reason: `High AI CSAM/underage confidence ${csam.toFixed(3)} ≥ ${thresholds.aiCsamQuarantine} — quarantine.`,
    };
  }

  if (csam >= thresholds.aiCsamReview) {
    return {
      status: "needs_human_review",
      result,
      reason: `Borderline AI CSAM/underage score ${csam.toFixed(3)} in [${thresholds.aiCsamReview}, ${thresholds.aiCsamQuarantine}) — needs human review.`,
    };
  }

  // -------------------------------------------------------------------------
  // 4–5) Violence / graphic content
  // -------------------------------------------------------------------------
  if (violence >= thresholds.aiViolenceReject) {
    return {
      status: "rejected",
      result,
      reason: `High AI violence score ${violence.toFixed(3)} ≥ ${thresholds.aiViolenceReject} — rejected.`,
    };
  }

  if (violence >= thresholds.aiViolenceReview) {
    return {
      status: "needs_human_review",
      result,
      reason: `Borderline AI violence score ${violence.toFixed(3)} in [${thresholds.aiViolenceReview}, ${thresholds.aiViolenceReject}) — needs human review.`,
    };
  }

  // -------------------------------------------------------------------------
  // 6–8) Adult / sexual content (non-CSAM)
  //    Extreme → rejected.
  //    Clear adult → adult or rejected per MODERATION_ADULT_POLICY.
  //    Borderline → human review (avoid auto-clean on ambiguous scores).
  // -------------------------------------------------------------------------
  if (nudity >= thresholds.aiNudityReject) {
    return {
      status: "rejected",
      result,
      reason: `Extreme AI nudity score ${nudity.toFixed(3)} ≥ ${thresholds.aiNudityReject} — rejected.`,
    };
  }

  if (nudity >= thresholds.aiNudityAdult) {
    const status =
      thresholds.adultPolicy === "rejected" ? "rejected" : "adult";
    return {
      status,
      result,
      reason: `Clear adult nudity score ${nudity.toFixed(3)} ≥ ${thresholds.aiNudityAdult} — policy=${thresholds.adultPolicy} → ${status}.`,
    };
  }

  if (nudity >= thresholds.aiNudityReview) {
    return {
      status: "needs_human_review",
      result,
      reason: `Borderline AI nudity score ${nudity.toFixed(3)} in [${thresholds.aiNudityReview}, ${thresholds.aiNudityAdult}) — needs human review.`,
    };
  }

  // -------------------------------------------------------------------------
  // 9) All clear for automated policy
  // -------------------------------------------------------------------------
  return {
    status: "clean",
    result,
    reason:
      "No PhotoDNA match; AI CSAM/nudity/violence scores below review thresholds — clean.",
  };
}

// ---------------------------------------------------------------------------
// Step 5b — NCMEC CyberTipline (triggered on CSAM)
// ---------------------------------------------------------------------------

/**
 * Escalate a CSAM hit through the CyberTipline reporter.
 * Prefer `reportCsamIncident` / `reportCsamIncidentForMedia` directly.
 *
 * @deprecated Use reportCsamIncidentForMedia — this wrapper remains for callers
 * that only have mediaId + key.
 */
export async function triggerNcmecReporting(
  mediaId: string,
  key: string,
): Promise<string> {
  const result = await reportCsamIncidentForMedia(mediaId, key, {
    additionalInfo: "Triggered from moderation pipeline CSAM path.",
  });
  return result.reportId;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Full moderation pipeline for one media object.
 *
 * 1–2. PhotoDNA + AI content moderation **in parallel**
 * 3. Decide final status (combined decision engine)
 * 4. Update the database (or CSAM quarantine + NCMEC report)
 *
 * @param mediaId - Database media row id
 * @param key - R2 object key to scan (typically media.originalKey)
 */
export async function processMediaModeration(
  mediaId: string,
  key: string,
): Promise<ProcessMediaModerationOutcome> {
  if (!mediaId?.trim()) {
    throw new Error("processMediaModeration requires a mediaId.");
  }
  if (!key?.trim()) {
    throw new Error("processMediaModeration requires an R2 object key.");
  }

  const forced = resolveForcedModerationStatus();
  if (forced) {
    return applyForcedModerationStatus(mediaId, key, forced);
  }

  // Prefetch bytes once when either live scanner is on (avoids double R2 GET).
  // HEIC/HEIF from iPhone is converted to JPEG so PhotoDNA / AI scanners can read it.
  let shared: ScanInput = { key };
  if (isPhotoDnaEnabled() || isAiModerationEnabled()) {
    try {
      const object = await getObjectBytes(key);
      const { ensureJpegForProcessing } = await import(
        "@/lib/media/decode-image"
      );
      const decoded = await ensureJpegForProcessing(object.body, {
        contentType: object.contentType,
        filename: key,
      });
      shared = {
        key,
        buffer: decoded.buffer,
        contentType: decoded.contentType,
      };
      console.info("[moderation.service] Prefetched object for parallel scanners", {
        key,
        bytes: decoded.buffer.byteLength,
        contentType: decoded.contentType,
        convertedFromHeic: decoded.converted,
      });
    } catch (error) {
      console.warn(
        "[moderation.service] Prefetch failed — scanners will fetch/mock individually",
        { key, error },
      );
    }
  }

  // 1–2. PhotoDNA + AI in parallel, then combine in the decision engine.
  console.info("[moderation.service] Running PhotoDNA + AI in parallel", {
    mediaId,
    key,
    photodnaLive: isPhotoDnaEnabled(),
    aiLive: isAiModerationEnabled(),
  });

  const [photodna, ai] = await Promise.all([
    checkWithPhotoDNA(shared),
    checkWithAI(shared),
  ]);

  // 3. Decide final status
  const decision = decideModerationStatus({ photodna, ai });
  decision.result.notes = [decision.result.notes, decision.reason]
    .filter(Boolean)
    .join(" | ");

  console.info("[moderation.service] Combined decision", {
    mediaId,
    status: decision.status,
    reason: decision.reason,
    photodnaMatch: photodna.match,
    aiCsamScore: ai.csamScore,
    aiNudityScore: ai.nudityScore,
    aiViolenceScore: ai.violenceScore,
  });

  // 4–5. Persist + escalate
  if (decision.status === "csam_quarantined") {
    const report = await reportCsamIncidentForMedia(mediaId, key, {
      detectedAt: new Date(),
      additionalInfo: decision.reason,
      moderationResult: decision.result,
    });
    return {
      media: report.media,
      decision,
      ncmecReportId: report.reportId,
    };
  }

  const media = await updateMediaModerationStatus(
    mediaId,
    decision.status,
    decision.result,
  );

  return { media, decision };
}
