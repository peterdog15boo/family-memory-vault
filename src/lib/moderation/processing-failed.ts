import type { ModerationLabels, ModerationResult } from "@/lib/moderation/types";

export const PROCESSING_FAILED_LABEL = "processing_failed";

export function hasProcessingFailedLabel(labels: unknown): boolean {
  if (!labels || typeof labels !== "object") return false;
  const rec = labels as ModerationLabels;
  if (
    Array.isArray(rec.labels) &&
    rec.labels.includes(PROCESSING_FAILED_LABEL)
  ) {
    return true;
  }
  const notes =
    typeof (rec as { notes?: unknown }).notes === "string"
      ? (rec as { notes: string }).notes
      : "";
  if (/processing failed after/i.test(notes)) return true;
  return false;
}

export function processingFailedModerationResult(input: {
  attempts: number;
  maxAttempts: number;
  lastError: string;
}): ModerationResult {
  const message = input.lastError.slice(0, 500);
  return {
    photodnaMatch: false,
    provider: "worker.moderation",
    notes: `Processing failed after ${input.maxAttempts} attempts: ${message}. Held for human review — not a policy rejection.`,
    labels: {
      provider: "worker.moderation",
      labels: [PROCESSING_FAILED_LABEL],
      raw: {
        lastError: input.lastError.slice(0, 1000),
        attempts: input.attempts,
        maxAttempts: input.maxAttempts,
      },
    },
    raw: {
      stage: "moderation_worker",
      lastError: input.lastError.slice(0, 1000),
    },
  };
}
