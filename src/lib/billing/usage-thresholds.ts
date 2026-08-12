import { DEFAULT_LOCALE, formatDate, type AppLocale } from "@/lib/i18n";

/** Show gentle warnings when usage reaches this share of the limit. */
export const USAGE_WARNING_PERCENT = 80;

export type UsageLevel = "ok" | "warning" | "critical";

export function computePercentUsed(
  used: number,
  limit: number | null | undefined,
): number | null {
  if (limit == null || limit <= 0) return null;
  return Math.min(100, (used / limit) * 100);
}

export function getUsageLevel(percentUsed: number | null): UsageLevel {
  if (percentUsed == null) return "ok";
  if (percentUsed >= 100) return "critical";
  if (percentUsed >= USAGE_WARNING_PERCENT) return "warning";
  return "ok";
}

export function formatUsagePeriodReset(
  now = new Date(),
  locale: AppLocale = DEFAULT_LOCALE,
): string {
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return formatDate(next, locale, {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatBillingDate(
  date: Date,
  locale: AppLocale = DEFAULT_LOCALE,
): string {
  return formatDate(date, locale, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
