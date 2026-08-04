import { describe, expect, it } from "vitest";
import type { EmergencyAccessDesignation } from "@/lib/db/schema";
import {
  buildGrantPatch,
  buildRequestPatch,
  canOwnerDeny,
  canOwnerGrant,
  canRequestEmergencyAccess,
  computeEmergencyAccessTransition,
  isEmergencyGrantActive,
} from "@/lib/emergency-access/access";

function baseRow(
  overrides: Partial<EmergencyAccessDesignation> = {},
): EmergencyAccessDesignation {
  return {
    id: "ea1",
    ownerUserId: "owner1",
    designateeEmail: "trust@example.com",
    designateeUserId: "user2",
    designateeName: "Alex",
    relationship: "Sibling",
    status: "designated",
    accessType: "temporary",
    waitingPeriodHours: 72,
    grantDurationDays: 30,
    requestedAt: null,
    waitingEndsAt: null,
    grantedAt: null,
    grantedBy: null,
    grantExpiresAt: null,
    deniedAt: null,
    denialReason: null,
    ownerNotes: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

describe("emergency access workflow", () => {
  it("allows request from designated or expired states", () => {
    expect(canRequestEmergencyAccess(baseRow())).toBe(true);
    expect(canRequestEmergencyAccess(baseRow({ status: "expired" }))).toBe(true);
    expect(canRequestEmergencyAccess(baseRow({ status: "requested" }))).toBe(
      false,
    );
  });

  it("auto-grants after waiting period when configured", () => {
    const now = new Date("2026-01-05T12:00:00Z");
    const patch = computeEmergencyAccessTransition(
      baseRow({
        status: "requested",
        waitingPeriodHours: 72,
        waitingEndsAt: new Date("2026-01-05T11:00:00Z"),
      }),
      now,
    );
    expect(patch?.status).toBe("granted");
    expect(patch?.grantedBy).toBe("auto");
    expect(patch?.grantExpiresAt).toBeInstanceOf(Date);
  });

  it("auto-grants permanent access without expiry", () => {
    const now = new Date("2026-01-05T12:00:00Z");
    const patch = computeEmergencyAccessTransition(
      baseRow({
        status: "requested",
        accessType: "permanent",
        waitingPeriodHours: 72,
        waitingEndsAt: new Date("2026-01-05T11:00:00Z"),
      }),
      now,
    );
    expect(patch?.status).toBe("granted");
    expect(patch?.grantExpiresAt).toBeNull();
  });

  it("does not auto-grant when waiting period is manual-only", () => {
    const patch = computeEmergencyAccessTransition(
      baseRow({
        status: "requested",
        waitingPeriodHours: 0,
        waitingEndsAt: null,
      }),
    );
    expect(patch).toBeNull();
  });

  it("expires grants after grant_expires_at", () => {
    const patch = computeEmergencyAccessTransition(
      baseRow({
        status: "granted",
        grantExpiresAt: new Date("2026-01-01T00:00:00Z"),
      }),
      new Date("2026-01-02T00:00:00Z"),
    );
    expect(patch?.status).toBe("expired");
  });

  it("expires temporary grants with missing expiry (invalid state)", () => {
    const patch = computeEmergencyAccessTransition(
      baseRow({
        status: "granted",
        accessType: "temporary",
        grantExpiresAt: null,
      }),
      new Date("2026-01-02T00:00:00Z"),
    );
    expect(patch?.status).toBe("expired");
  });

  it("does not expire permanent grants even when grant_expires_at is past", () => {
    const patch = computeEmergencyAccessTransition(
      baseRow({
        status: "granted",
        accessType: "permanent",
        grantExpiresAt: new Date("2020-01-01T00:00:00Z"),
      }),
      new Date("2026-01-02T00:00:00Z"),
    );
    expect(patch).toBeNull();
  });

  it("detects active grants", () => {
    expect(
      isEmergencyGrantActive(
        baseRow({
          status: "granted",
          grantExpiresAt: new Date("2099-01-01"),
        }),
      ),
    ).toBe(true);
    expect(
      isEmergencyGrantActive(
        baseRow({
          status: "granted",
          grantExpiresAt: new Date("2020-01-01"),
        }),
      ),
    ).toBe(false);
    expect(
      isEmergencyGrantActive(
        baseRow({
          status: "granted",
          accessType: "permanent",
          grantExpiresAt: null,
        }),
      ),
    ).toBe(true);
    expect(
      isEmergencyGrantActive(
        baseRow({
          status: "granted",
          accessType: "temporary",
          grantExpiresAt: null,
        }),
      ),
    ).toBe(false);
  });

  it("owner can grant from designated or requested", () => {
    expect(canOwnerGrant(baseRow())).toBe(true);
    expect(canOwnerGrant(baseRow({ status: "requested" }))).toBe(true);
    expect(canOwnerGrant(baseRow({ status: "denied" }))).toBe(false);
  });

  it("owner can deny only requested", () => {
    expect(canOwnerDeny(baseRow({ status: "requested" }))).toBe(true);
    expect(canOwnerDeny(baseRow())).toBe(false);
  });

  it("buildRequestPatch clears prior denial", () => {
    const patch = buildRequestPatch(
      baseRow({ status: "expired", deniedAt: new Date(), denialReason: "no" }),
      new Date("2026-02-01T00:00:00Z"),
    );
    expect(patch.status).toBe("requested");
    expect(patch.deniedAt).toBeNull();
    expect(patch.waitingEndsAt).toBeInstanceOf(Date);
  });

  it("buildGrantPatch sets expiry from grant duration", () => {
    const now = new Date("2026-02-01T00:00:00Z");
    const patch = buildGrantPatch(baseRow(), "owner", now);
    expect(patch.status).toBe("granted");
    expect(patch.grantedBy).toBe("owner");
    expect(patch.grantExpiresAt?.getTime()).toBe(
      now.getTime() + 30 * 24 * 60 * 60 * 1000,
    );
  });

  it("buildGrantPatch leaves permanent grants without expiry", () => {
    const now = new Date("2026-02-01T00:00:00Z");
    const patch = buildGrantPatch(
      baseRow({ accessType: "permanent", grantDurationDays: 365 }),
      "owner",
      now,
    );
    expect(patch.status).toBe("granted");
    expect(patch.grantExpiresAt).toBeNull();
  });

  it("buildGrantPatch uses 365-day temporary duration", () => {
    const now = new Date("2026-02-01T00:00:00Z");
    const patch = buildGrantPatch(
      baseRow({ accessType: "temporary", grantDurationDays: 365 }),
      "owner",
      now,
    );
    expect(patch.grantExpiresAt?.getTime()).toBe(
      now.getTime() + 365 * 24 * 60 * 60 * 1000,
    );
  });
});
