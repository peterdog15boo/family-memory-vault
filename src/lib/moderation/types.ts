import { z } from "zod";

/**
 * Moderation outcome statuses for uploaded media and related content.
 *
 * - pending: awaiting automated scan (initial upload state)
 * - clean: cleared for family viewing
 * - adult: adult (non-CSAM) content; restricted from family-safe surfaces
 * - csam_quarantined: suspected CSAM; isolated — never served; escalate per policy
 * - rejected: removed / not allowed for other policy reasons
 * - needs_human_review: automated scores are borderline/ambiguous, or scanners failed after retries — hold for a person
 */
export const MODERATION_STATUSES = [
  "pending",
  "clean",
  "adult",
  "csam_quarantined",
  "rejected",
  "needs_human_review",
] as const;

export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const moderationStatusSchema = z.enum(MODERATION_STATUSES);

export function isModerationStatus(value: unknown): value is ModerationStatus {
  return moderationStatusSchema.safeParse(value).success;
}

/** Statuses that must never be publicly served to end users. */
export const UNSAFE_MODERATION_STATUSES = [
  "pending",
  "adult",
  "csam_quarantined",
  "rejected",
  "needs_human_review",
] as const satisfies readonly ModerationStatus[];

export type UnsafeModerationStatus = (typeof UNSAFE_MODERATION_STATUSES)[number];

export function isSafeToServe(status: ModerationStatus): boolean {
  return status === "clean";
}

/**
 * Structured labels / category scores from a moderation provider.
 */
export type ModerationLabels = {
  labels?: string[];
  categories?: Record<string, number>;
  provider?: string;
  raw?: Record<string, unknown>;
};

/**
 * Full result payload from an automated (or human-assisted) moderation pass.
 * Persisted onto the media row and mirrored into moderation_events.
 */
export interface ModerationResult {
  /** Microsoft PhotoDNA / hash-matching hit */
  photodnaMatch: boolean;
  /** Model score for CSAM risk in [0, 1] when available */
  aiCsamScore?: number | null;
  /** Model score for nudity / adult content in [0, 1] when available */
  aiNudityScore?: number | null;
  /** Model score for violence / graphic content in [0, 1] when available */
  aiViolenceScore?: number | null;
  /** Provider label taxonomy / category map */
  labels?: ModerationLabels | null;
  /** Which scanner produced this result */
  provider?: string;
  /** Opaque provider response for audit (avoid storing illegal imagery) */
  raw?: Record<string, unknown>;
  /** Free-text notes for operators / workers */
  notes?: string;
}

export const moderationResultSchema = z.object({
  photodnaMatch: z.boolean(),
  aiCsamScore: z.number().min(0).max(1).nullable().optional(),
  aiNudityScore: z.number().min(0).max(1).nullable().optional(),
  aiViolenceScore: z.number().min(0).max(1).nullable().optional(),
  labels: z
    .object({
      labels: z.array(z.string()).optional(),
      categories: z.record(z.string(), z.number()).optional(),
      provider: z.string().optional(),
      raw: z.record(z.string(), z.unknown()).optional(),
    })
    .nullable()
    .optional(),
  provider: z.string().optional(),
  raw: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().optional(),
});
