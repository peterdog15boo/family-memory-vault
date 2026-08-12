/**
 * Locale-aware date / time / number / currency formatting via Intl.
 * Defaults to US English (`en-US`).
 */

import {
  DEFAULT_LOCALE,
  isAppLocale,
  type AppLocale,
} from "@/lib/i18n/locales";

export type DateInput = Date | string | number;

export type Formatters = {
  locale: AppLocale;
  date: (
    value: DateInput,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
  dateTime: (
    value: DateInput,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
  time: (
    value: DateInput,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
  number: (
    value: number,
    options?: Intl.NumberFormatOptions,
  ) => string;
  /** Format a major-unit amount (e.g. dollars), not cents. */
  currency: (
    amount: number,
    options?: Intl.NumberFormatOptions & { currency?: string },
  ) => string;
  /** Format an integer amount in the smallest currency unit (e.g. USD cents). */
  cents: (
    cents: number,
    options?: { currency?: string },
  ) => string;
  /** Format a ratio (0–1) or pass `{ raw: true }` for an already-scaled percent (e.g. 42). */
  percent: (
    value: number,
    options?: Intl.NumberFormatOptions & { raw?: boolean },
  ) => string;
};

const DEFAULT_DATE: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

const DEFAULT_DATE_TIME: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

const DEFAULT_TIME: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
};

function toDate(value: DateInput): Date {
  if (value instanceof Date) return value;
  return new Date(value);
}

function safeDateFormat(
  locale: AppLocale,
  value: DateInput,
  options: Intl.DateTimeFormatOptions,
): string {
  try {
    const date = toDate(value);
    if (Number.isNaN(date.getTime())) {
      return typeof value === "string" ? value : "";
    }
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return typeof value === "string" ? value : String(value);
  }
}

function safeNumberFormat(
  locale: AppLocale,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return String(value);
  }
}

/** Resolve a locale for formatting; unknown values fall back to en-US. */
export function formatLocale(
  locale: AppLocale | string | null | undefined = DEFAULT_LOCALE,
): AppLocale {
  return isAppLocale(locale) ? locale : DEFAULT_LOCALE;
}

export function formatDate(
  value: DateInput,
  locale: AppLocale | string | null | undefined = DEFAULT_LOCALE,
  options?: Intl.DateTimeFormatOptions,
): string {
  return safeDateFormat(
    formatLocale(locale),
    value,
    options ?? DEFAULT_DATE,
  );
}

export function formatDateTime(
  value: DateInput,
  locale: AppLocale | string | null | undefined = DEFAULT_LOCALE,
  options?: Intl.DateTimeFormatOptions,
): string {
  return safeDateFormat(
    formatLocale(locale),
    value,
    options ?? DEFAULT_DATE_TIME,
  );
}

export function formatTime(
  value: DateInput,
  locale: AppLocale | string | null | undefined = DEFAULT_LOCALE,
  options?: Intl.DateTimeFormatOptions,
): string {
  return safeDateFormat(
    formatLocale(locale),
    value,
    options ?? DEFAULT_TIME,
  );
}

export function formatNumber(
  value: number,
  locale: AppLocale | string | null | undefined = DEFAULT_LOCALE,
  options?: Intl.NumberFormatOptions,
): string {
  return safeNumberFormat(formatLocale(locale), value, options);
}

export function formatCurrency(
  amount: number,
  locale: AppLocale | string | null | undefined = DEFAULT_LOCALE,
  options: Intl.NumberFormatOptions & { currency?: string } = {},
): string {
  const { currency = "USD", ...rest } = options;
  return safeNumberFormat(formatLocale(locale), amount, {
    style: "currency",
    currency,
    ...rest,
  });
}

/** Format Stripe-style integer cents (or other minor units) as currency. */
export function formatCents(
  cents: number,
  locale: AppLocale | string | null | undefined = DEFAULT_LOCALE,
  options: { currency?: string } = {},
): string {
  const currency = options.currency ?? "USD";
  const amount = cents / 100;
  return formatCurrency(amount, locale, {
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}

export function formatPercent(
  value: number,
  locale: AppLocale | string | null | undefined = DEFAULT_LOCALE,
  options: Intl.NumberFormatOptions & { raw?: boolean } = {},
): string {
  const { raw, ...rest } = options;
  const ratio = raw ? value / 100 : value;
  return safeNumberFormat(formatLocale(locale), ratio, {
    style: "percent",
    maximumFractionDigits: 0,
    ...rest,
  });
}

export function createFormatters(
  locale: AppLocale | string | null | undefined = DEFAULT_LOCALE,
): Formatters {
  const resolved = formatLocale(locale);
  return {
    locale: resolved,
    date: (value, options) => formatDate(value, resolved, options),
    dateTime: (value, options) => formatDateTime(value, resolved, options),
    time: (value, options) => formatTime(value, resolved, options),
    number: (value, options) => formatNumber(value, resolved, options),
    currency: (amount, options) => formatCurrency(amount, resolved, options),
    cents: (cents, options) => formatCents(cents, resolved, options),
    percent: (value, options) => formatPercent(value, resolved, options),
  };
}
