/**
 * Emergency access workflow transitions and permission checks.
 */

import type { EmergencyAccessDesignation } from "@/lib/db/schema";
import {
  DEFAULT_GRANT_DURATION_DAYS,
  type EmergencyAccessStatus,
  type EmergencyAccessType,
} from "@/lib/emergency-access/types";

export type LegacyAccessRole = "owner" | "granted_emergency" | false;

export function normalizeEmergencyEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isPermanentEmergencyAccess(
  row: Pick<EmergencyAccessDesignation, "accessType">,
): boolean {
  return row.accessType === "permanent";
}

function grantExpiryForAccessType(
  accessType: EmergencyAccessType,
  grantDurationDays: number,
  grantedAt: Date,
): Date | null {
  if (accessType === "permanent") return null;
  const days = grantDurationDays || DEFAULT_GRANT_DURATION_DAYS;
  return addDays(grantedAt, days);
}

/** Whether a granted designation currently allows legacy vault read access. */
export function isEmergencyGrantActive(
  row: Pick<
    EmergencyAccessDesignation,
    "status" | "accessType" | "grantExpiresAt"
  >,
  now: Date = new Date(),
): boolean {
  if (row.status !== "granted") return false;
  if (isPermanentEmergencyAccess(row)) return true;
  return (
    row.grantExpiresAt != null &&
    row.grantExpiresAt.getTime() > now.getTime()
  );
}

/** Apply time-based transitions (auto-grant, expiry). Returns patch if changed. */
export function computeEmergencyAccessTransition(
  row: EmergencyAccessDesignation,
  now: Date = new Date(),
): Partial<EmergencyAccessDesignation> | null {
  if (
    row.status === "requested" &&
    row.waitingPeriodHours > 0 &&
    row.waitingEndsAt &&
    row.waitingEndsAt.getTime() <= now.getTime()
  ) {
    const grantedAt = now;
    return {
      status: "granted" as EmergencyAccessStatus,
      grantedAt,
      grantedBy: "auto",
      grantExpiresAt: grantExpiryForAccessType(
        row.accessType,
        row.grantDurationDays,
        grantedAt,
      ),
      updatedAt: now,
    };
  }

  // Permanent grants never auto-expire — owner must revoke explicitly.
  // Temporary grants with a missing expiry are invalid (e.g. race) and expire.
  if (
    row.status === "granted" &&
    !isPermanentEmergencyAccess(row) &&
    (!row.grantExpiresAt ||
      row.grantExpiresAt.getTime() <= now.getTime())
  ) {
    return {
      status: "expired" as EmergencyAccessStatus,
      updatedAt: now,
    };
  }

  return null;
}

export function resolveLegacyAccessRole(input: {
  viewerUserId: string;
  ownerUserId: string;
  activeGrant?: Pick<
    EmergencyAccessDesignation,
    "status" | "accessType" | "grantExpiresAt"
  > | null;
}): LegacyAccessRole {
  if (input.viewerUserId === input.ownerUserId) return "owner";
  if (input.activeGrant && isEmergencyGrantActive(input.activeGrant)) {
    return "granted_emergency";
  }
  return false;
}

export function canRequestEmergencyAccess(
  row: EmergencyAccessDesignation,
): boolean {
  return row.status === "designated" || row.status === "expired";
}

export function canOwnerGrant(row: EmergencyAccessDesignation): boolean {
  return row.status === "requested" || row.status === "designated";
}

export function canOwnerDeny(row: EmergencyAccessDesignation): boolean {
  return row.status === "requested";
}

export function buildGrantPatch(
  row: EmergencyAccessDesignation,
  grantedBy: "owner" | "auto",
  now: Date = new Date(),
): Partial<EmergencyAccessDesignation> {
  return {
    status: "granted",
    grantedAt: now,
    grantedBy,
    grantExpiresAt: grantExpiryForAccessType(
      row.accessType,
      row.grantDurationDays,
      now,
    ),
    deniedAt: null,
    denialReason: null,
    updatedAt: now,
  };
}

export function buildRequestPatch(
  row: EmergencyAccessDesignation,
  now: Date = new Date(),
): Partial<EmergencyAccessDesignation> {
  const waitingEndsAt =
    row.waitingPeriodHours > 0
      ? addHours(now, row.waitingPeriodHours)
      : null;

  return {
    status: "requested",
    requestedAt: now,
    waitingEndsAt,
    grantedAt: null,
    grantedBy: null,
    grantExpiresAt: null,
    deniedAt: null,
    denialReason: null,
    updatedAt: now,
  };
}

export function buildDenyPatch(
  reason: string | null | undefined,
  now: Date = new Date(),
): Partial<EmergencyAccessDesignation> {
  return {
    status: "denied",
    deniedAt: now,
    denialReason: reason?.trim() || null,
    updatedAt: now,
  };
}

export function buildResetToDesignatedPatch(
  now: Date = new Date(),
): Partial<EmergencyAccessDesignation> {
  return {
    status: "designated",
    requestedAt: null,
    waitingEndsAt: null,
    grantedAt: null,
    grantedBy: null,
    grantExpiresAt: null,
    deniedAt: null,
    denialReason: null,
    updatedAt: now,
  };
}
