/**
 * Date helpers for private document metadata (document date / reminders).
 * Prefer calendar dates (YYYY-MM-DD) in the UI; store as timestamptz noon UTC.
 */

import type { DocumentReminderKind } from "@/lib/documents/types";
import { DOCUMENT_REMINDER_KIND_LABELS } from "@/lib/documents/types";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export type ReminderUrgency = "overdue" | "due_today" | "upcoming" | "none";

/** Parse YYYY-MM-DD or ISO string → Date. Empty/null → null. Undefined passthrough. */
export function parseOptionalDocumentDate(
  value: string | null | undefined,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = trimmed.match(DATE_ONLY);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return parsed;
}

/** Format a Date/ISO for <input type="date">. */
export function toDateInputValue(
  value: Date | string | null | undefined,
): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Start of today (UTC) for reminder filters. */
export function startOfTodayUtc(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/** End of today (UTC), exclusive next midnight. */
export function startOfTomorrowUtc(now: Date = new Date()): Date {
  const today = startOfTodayUtc(now);
  return new Date(today.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Compare a reminder calendar date to "today" in UTC.
 * Dates are stored at noon UTC; comparisons use calendar-day boundaries.
 */
export function getReminderUrgency(
  reminderAt: Date | string | null | undefined,
  now: Date = new Date(),
): ReminderUrgency {
  if (!reminderAt) return "none";
  const d = typeof reminderAt === "string" ? new Date(reminderAt) : reminderAt;
  if (Number.isNaN(d.getTime())) return "none";

  const today = startOfTodayUtc(now);
  const tomorrow = startOfTomorrowUtc(now);
  if (d < today) return "overdue";
  if (d < tomorrow) return "due_today";
  return "upcoming";
}

export function isReminderOverdue(
  reminderAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  return getReminderUrgency(reminderAt, now) === "overdue";
}

export function reminderKindLabel(
  kind: DocumentReminderKind | string | null | undefined,
): string | null {
  if (!kind) return null;
  if (kind in DOCUMENT_REMINDER_KIND_LABELS) {
    return DOCUMENT_REMINDER_KIND_LABELS[kind as DocumentReminderKind];
  }
  return null;
}

/** Short badge text for list rows. */
export function reminderStatusLabel(
  reminderAt: Date | string | null | undefined,
  kind?: DocumentReminderKind | string | null,
  now: Date = new Date(),
): string | null {
  if (!reminderAt) return null;
  const urgency = getReminderUrgency(reminderAt, now);
  const kindPart = reminderKindLabel(kind);
  if (urgency === "overdue") {
    return kindPart ? `Overdue · ${kindPart}` : "Overdue";
  }
  if (urgency === "due_today") {
    return kindPart ? `Due today · ${kindPart}` : "Due today";
  }
  return kindPart;
}
