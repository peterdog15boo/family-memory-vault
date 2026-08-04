/**
 * Emergency access — domain types and safety notes.
 *
 * Emergency access is NOT family sharing. It is a break-glass path to an
 * owner's Digital Legacy vault for explicitly designated trusted contacts.
 */

import {
  EMERGENCY_ACCESS_STATUSES,
  EMERGENCY_ACCESS_TYPES,
} from "@/lib/db/schema";

export type EmergencyAccessStatus = (typeof EMERGENCY_ACCESS_STATUSES)[number];
export type EmergencyAccessType = (typeof EMERGENCY_ACCESS_TYPES)[number];

export const EMERGENCY_ACCESS_STATUS_LABELS: Record<
  EmergencyAccessStatus,
  string
> = {
  designated: "Designated",
  requested: "Access requested",
  granted: "Access granted",
  denied: "Denied",
  expired: "Expired",
};

export const EMERGENCY_ACCESS_TYPE_LABELS: Record<EmergencyAccessType, string> =
  {
    temporary: "365 days",
    permanent: "Permanent Access",
  };

export const DEFAULT_WAITING_PERIOD_HOURS = 72;
/** Schema / legacy default when no duration is provided for temporary grants. */
export const DEFAULT_GRANT_DURATION_DAYS = 30;
/** UI preset for temporary emergency access grants. */
export const TEMPORARY_GRANT_DURATION_DAYS = 365;
export const MANUAL_ONLY_WAITING_PERIOD_HOURS = 0;

export type CreateEmergencyAccessDesignationInput = {
  ownerUserId: string;
  designateeEmail: string;
  designateeName: string;
  relationship?: string | null;
  waitingPeriodHours?: number;
  /** Defaults to temporary. */
  accessType?: EmergencyAccessType;
  /**
   * Required for temporary access (1–365). Ignored when accessType is permanent.
   */
  grantDurationDays?: number;
  ownerNotes?: string | null;
};

export type UpdateEmergencyAccessDesignationInput = {
  designateeEmail?: string;
  designateeName?: string;
  relationship?: string | null;
  waitingPeriodHours?: number;
  accessType?: EmergencyAccessType;
  grantDurationDays?: number;
  ownerNotes?: string | null;
};

export function emergencyAccessDurationLabel(input: {
  accessType: EmergencyAccessType;
  grantDurationDays: number;
}): string {
  if (input.accessType === "permanent") {
    return "Permanent Access";
  }
  return `${input.grantDurationDays} days`;
}

export const EMERGENCY_ACCESS_SAFETY = [
  "emergency_access_designations are separate from family sharing and legacy_contacts.",
  "Legacy vault content is never exposed until status is granted and the grant is active (temporary grants require a future grant_expires_at; permanent grants do not expire).",
  "Granted vault reads mask secure item content until the grantee reveal endpoint succeeds.",
  "Designatees must authenticate with an email matching designatee_email.",
  "Owners are notified when access is requested; auto-grant only occurs after the configured waiting period if not denied.",
  "Permanent Access is intended for trusted immediate family and remains valid until the owner explicitly revokes it.",
  "Notifications and emails must not include legacy vault text, passwords, or document contents.",
  "This feature is not legal advice — real-world estate planning may require an attorney.",
] as const;
