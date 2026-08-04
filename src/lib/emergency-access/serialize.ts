/**
 * JSON-safe shapes for emergency access API / client props.
 */

import type { EmergencyAccessDesignation } from "@/lib/db/schema";
import type {
  EmergencyAccessStatus,
  EmergencyAccessType,
} from "@/lib/emergency-access/types";

export type SerializedEmergencyAccessDesignation = {
  id: string;
  ownerUserId: string;
  designateeEmail: string;
  designateeUserId: string | null;
  designateeName: string;
  relationship: string | null;
  status: EmergencyAccessStatus;
  accessType: EmergencyAccessType;
  waitingPeriodHours: number;
  grantDurationDays: number;
  requestedAt: string | null;
  waitingEndsAt: string | null;
  grantedAt: string | null;
  grantedBy: string | null;
  grantExpiresAt: string | null;
  deniedAt: string | null;
  denialReason: string | null;
  ownerNotes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Owner display name when loaded for designatee views. */
  ownerDisplayName?: string | null;
};

export function serializeEmergencyAccessDesignation(
  row: EmergencyAccessDesignation,
  extras?: { ownerDisplayName?: string | null },
): SerializedEmergencyAccessDesignation {
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    designateeEmail: row.designateeEmail,
    designateeUserId: row.designateeUserId,
    designateeName: row.designateeName,
    relationship: row.relationship,
    status: row.status,
    accessType: row.accessType,
    waitingPeriodHours: row.waitingPeriodHours,
    grantDurationDays: row.grantDurationDays,
    requestedAt: row.requestedAt?.toISOString() ?? null,
    waitingEndsAt: row.waitingEndsAt?.toISOString() ?? null,
    grantedAt: row.grantedAt?.toISOString() ?? null,
    grantedBy: row.grantedBy,
    grantExpiresAt: row.grantExpiresAt?.toISOString() ?? null,
    deniedAt: row.deniedAt?.toISOString() ?? null,
    denialReason: row.denialReason,
    ownerNotes: row.ownerNotes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ownerDisplayName: extras?.ownerDisplayName ?? undefined,
  };
}
