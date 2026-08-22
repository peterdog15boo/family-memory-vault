import { describe, expect, it } from "vitest";
import { shouldSendWeeklyDigest } from "@/lib/digest/weekly";

describe("shouldSendWeeklyDigest", () => {
  it("allows first send on Sunday UTC", () => {
    // 2026-08-23 is a Sunday
    const sunday = new Date("2026-08-23T12:00:00.000Z");
    expect(
      shouldSendWeeklyDigest({
        lastWeeklyDigestAt: null,
        now: sunday,
      }),
    ).toBe(true);
  });

  it("blocks non-Sunday without force", () => {
    const monday = new Date("2026-08-24T12:00:00.000Z");
    expect(
      shouldSendWeeklyDigest({
        lastWeeklyDigestAt: null,
        now: monday,
      }),
    ).toBe(false);
  });

  it("allows force on any weekday when not recently sent", () => {
    const monday = new Date("2026-08-24T12:00:00.000Z");
    expect(
      shouldSendWeeklyDigest({
        lastWeeklyDigestAt: null,
        now: monday,
        force: true,
      }),
    ).toBe(true);
  });

  it("enforces 6-day dedupe even on Sunday", () => {
    const sunday = new Date("2026-08-23T12:00:00.000Z");
    expect(
      shouldSendWeeklyDigest({
        lastWeeklyDigestAt: "2026-08-20T12:00:00.000Z",
        now: sunday,
      }),
    ).toBe(false);
    expect(
      shouldSendWeeklyDigest({
        lastWeeklyDigestAt: "2026-08-16T12:00:00.000Z",
        now: sunday,
      }),
    ).toBe(true);
  });
});
