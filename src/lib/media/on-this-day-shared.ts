/**
 * Client-safe On This Day types + pure helpers (no DB / R2).
 */

import type { SerializedSafeMedia } from "@/lib/memories/types";

export type OnThisDayItem = SerializedSafeMedia & {
  /** Calendar year of the moment (capture or upload). */
  momentYear: number;
  /** ISO timestamp used for On This Day matching. */
  momentAt: string;
  /** True when taken_at was used (vs upload created_at). */
  fromCaptureDate: boolean;
};

/** Group items by year for UI sections (newest years first). */
export function groupOnThisDayByYear(
  items: OnThisDayItem[],
): Array<{ year: number; items: OnThisDayItem[] }> {
  const map = new Map<number, OnThisDayItem[]>();
  for (const item of items) {
    const list = map.get(item.momentYear) ?? [];
    list.push(item);
    map.set(item.momentYear, list);
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, group]) => ({
      year,
      items: group.sort((a, b) => b.momentAt.localeCompare(a.momentAt)),
    }));
}

/** Exported for unit tests. */
export function onThisDayMatchesMonthDay(
  moment: Date,
  month: number,
  day: number,
  currentYear: number,
): boolean {
  return (
    moment.getUTCMonth() + 1 === month &&
    moment.getUTCDate() === day &&
    moment.getUTCFullYear() < currentYear
  );
}
