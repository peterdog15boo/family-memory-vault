import { describe, expect, it } from "vitest";
import {
  canAcceptUpload,
  formatBytes,
  formatStorageUsageLabel,
  type StorageQuotaSnapshot,
} from "@/lib/billing/quotas";
import {
  computePercentUsed,
  getUsageLevel,
} from "@/lib/billing/usage-thresholds";
import type { PlanLimits } from "@/lib/plans";

const baseLimits = {
  slug: "free",
  name: "Free",
  storageLimitBytes: 5 * 1024 ** 3,
  maxFamilyMembers: 1,
  maxMoviesPerMonth: 5,
  maxActiveMovieJobs: 1,
  features: {
    familySharing: false,
    faceDetection: true,
    cinematicThemes: false,
    priorityRender: false,
    maxPeople: 25,
    supportLevel: "community",
  },
} satisfies PlanLimits;

function snapshot(
  overrides: Partial<StorageQuotaSnapshot> = {},
): StorageQuotaSnapshot {
  const usedBytes = overrides.usedBytes ?? 0;
  const limitBytes =
    overrides.limitBytes === undefined ? 1000 : overrides.limitBytes;
  const remainingBytes =
    limitBytes == null ? null : Math.max(0, limitBytes - usedBytes);
  return {
    scope: "user",
    userId: "user_1",
    familyId: null,
    usedBytes,
    limitBytes,
    remainingBytes,
    percentUsed:
      limitBytes == null ? null : Math.min(100, (usedBytes / limitBytes) * 100),
    planName: "Free",
    planSlug: "free",
    limits: baseLimits,
    label: "test",
    ...overrides,
  };
}

describe("canAcceptUpload", () => {
  it("allows any size when the plan is unlimited", () => {
    expect(canAcceptUpload(snapshot({ limitBytes: null }), 9_000_000_000)).toBe(
      true,
    );
  });

  it("allows uploads that fit under the remaining quota", () => {
    expect(canAcceptUpload(snapshot({ usedBytes: 400, limitBytes: 1000 }), 600)).toBe(
      true,
    );
  });

  it("allows uploads that land exactly on the limit", () => {
    expect(canAcceptUpload(snapshot({ usedBytes: 700, limitBytes: 1000 }), 300)).toBe(
      true,
    );
  });

  it("rejects uploads that would exceed the limit", () => {
    expect(canAcceptUpload(snapshot({ usedBytes: 700, limitBytes: 1000 }), 301)).toBe(
      false,
    );
  });

  it("floors fractional/negative additional bytes", () => {
    expect(canAcceptUpload(snapshot({ usedBytes: 999, limitBytes: 1000 }), 1.9)).toBe(
      true,
    );
    expect(canAcceptUpload(snapshot({ usedBytes: 1000, limitBytes: 1000 }), -5)).toBe(
      true,
    );
  });
});

describe("formatBytes", () => {
  it("formats bytes through GB", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 ** 2)).toMatch(/MB/);
    expect(formatBytes(2 * 1024 ** 3)).toMatch(/GB/);
  });

  it("treats invalid input as zero", () => {
    expect(formatBytes(Number.NaN)).toBe("0 B");
    expect(formatBytes(-10)).toBe("0 B");
  });
});

describe("formatStorageUsageLabel", () => {
  it("shows unlimited when there is no limit", () => {
    expect(formatStorageUsageLabel(100, null)).toMatch(/unlimited/i);
  });

  it("pairs used and limit in a shared unit", () => {
    const label = formatStorageUsageLabel(1024 ** 3, 5 * 1024 ** 3);
    expect(label).toMatch(/GB/);
    expect(label).toMatch(/used/i);
  });
});

describe("usage thresholds", () => {
  it("computePercentUsed returns null for unlimited", () => {
    expect(computePercentUsed(100, null)).toBeNull();
    expect(computePercentUsed(100, 0)).toBeNull();
  });

  it("maps percent to ok / warning / critical", () => {
    expect(getUsageLevel(null)).toBe("ok");
    expect(getUsageLevel(50)).toBe("ok");
    expect(getUsageLevel(80)).toBe("warning");
    expect(getUsageLevel(100)).toBe("critical");
  });
});
