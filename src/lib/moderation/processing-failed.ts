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

/** Best-effort vendor/timeout detail for admin review UI. */
export function processingFailedDetail(labels: unknown): string | null {
  if (!hasProcessingFailedLabel(labels) || !labels || typeof labels !== "object") {
    return null;
  }
  const rec = labels as ModerationLabels & {
    raw?: { lastError?: unknown };
    notes?: unknown;
  };
  const rawError =
    typeof rec.raw?.lastError === "string" ? rec.raw.lastError.trim() : "";
  if (rawError) return rawError.slice(0, 400);
  if (typeof rec.notes === "string" && rec.notes.trim()) {
    return rec.notes.trim().slice(0, 400);
  }
  return null;
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
