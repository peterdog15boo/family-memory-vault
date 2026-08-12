import { describe, expect, it } from "vitest";
import {
  createFormatters,
  formatCents,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatTime,
} from "@/lib/i18n/format";

describe("i18n formatters", () => {
  const sample = new Date(Date.UTC(2026, 7, 7, 15, 30, 0));

  it("defaults to en-US formatting", () => {
    expect(formatNumber(1234.5)).toBe("1,234.5");
    expect(formatCents(1999)).toMatch(/\$19\.99/);
    expect(formatCurrency(20)).toMatch(/\$20/);
    expect(formatPercent(0.42)).toMatch(/42/);
    expect(
      formatDate(sample, "en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }),
    ).toMatch(/Aug/);
  });

  it("formats numbers and currency for other locales", () => {
    expect(formatNumber(1234.5, "de")).toMatch(/1\.234/);
    expect(formatCents(1999, "de")).toMatch(/19/);
    expect(formatCents(2000, "fr")).toMatch(/20/);
  });

  it("createFormatters binds locale", () => {
    const de = createFormatters("de");
    expect(de.locale).toBe("de");
    expect(de.number(1000)).toMatch(/1\.000/);
    expect(de.cents(500)).toMatch(/5/);
  });

  it("formats date and time with Intl", () => {
    const fr = createFormatters("fr");
    const date = fr.date(sample, {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    expect(date.toLowerCase()).toMatch(/août|aout/);
    expect(
      formatTime(sample, "en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: false,
        timeZone: "UTC",
      }),
    ).toMatch(/15:30/);
    expect(
      formatDateTime(sample, "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }),
    ).toBeTruthy();
  });

  it("falls back unknown locales to en-US", () => {
    expect(createFormatters("xx-YY" as never).locale).toBe("en-US");
  });
});
