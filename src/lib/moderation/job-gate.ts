import { isOriginalsKey } from "@/lib/r2";
import { hasProcessingFailedLabel } from "@/lib/moderation/processing-failed";
import type { ModerationStatus } from "@/lib/moderation/types";

type JobGateRow = {
  moderationStatus: ModerationStatus;
  status: string;
  ncmecReportId?: string | null;
  originalKey: string;
  moderationLabels?: unknown;
};

/**
 * Whether a claimed moderation job should skip scanners.
 * Scanner/vendor failures are never terminal — Ops retry must re-scan.
 */
export function shouldSkipModerationRescan(
  row: JobGateRow,
): { handled: boolean; reason?: string } {
  if (
    hasProcessingFailedLabel(row.moderationLabels) &&
    row.moderationStatus !== "csam_quarantined" &&
    row.moderationStatus !== "clean"
  ) {
    return {
      handled: false,
      reason: "processing_failed — not a policy decision; rescan allowed",
    };
  }

  if (
    row.moderationStatus === "clean" &&
    (row.status === "ready" || isOriginalsKey(row.originalKey))
  ) {
    return {
      handled: true,
      reason: "Media already clean/ready — idempotent skip.",
    };
  }

  if (row.moderationStatus === "csam_quarantined") {
    if (row.ncmecReportId?.trim()) {
      return {
        handled: true,
        reason:
          "Media already csam_quarantined with NCMEC report id — idempotent skip.",
      };
    }
    return {
      handled: false,
      reason: "csam_quarantined without ncmecReportId — resume reporting",
    };
  }

  if (
    row.moderationStatus === "adult" ||
    row.moderationStatus === "rejected" ||
    row.moderationStatus === "needs_human_review"
  ) {
    return {
      handled: true,
      reason: `Media already ${row.moderationStatus} — idempotent skip.`,
    };
  }

  return { handled: false };
}
