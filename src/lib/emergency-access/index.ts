/**
 * Emergency access designations — owner-scoped CRUD and break-glass workflow.
 */

import { and, desc, eq, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import {
  emergencyAccessDesignations,
  users,
  type EmergencyAccessDesignation,
} from "@/lib/db/schema";
import {
  buildDenyPatch,
  buildGrantPatch,
  buildRequestPatch,
  buildResetToDesignatedPatch,
  canOwnerDeny,
  canOwnerGrant,
  canRequestEmergencyAccess,
  computeEmergencyAccessTransition,
  isEmergencyGrantActive,
  normalizeEmergencyEmail,
} from "@/lib/emergency-access/access";
import {
  DEFAULT_WAITING_PERIOD_HOURS,
  TEMPORARY_GRANT_DURATION_DAYS,
  type CreateEmergencyAccessDesignationInput,
  type UpdateEmergencyAccessDesignationInput,
} from "@/lib/emergency-access/types";
import { createNotification } from "@/lib/notifications";

export {
  isEmergencyGrantActive,
  isPermanentEmergencyAccess,
  resolveLegacyAccessRole,
} from "@/lib/emergency-access/access";
export { EMERGENCY_ACCESS_SAFETY } from "@/lib/emergency-access/types";
export type { LegacyAccessRole } from "@/lib/emergency-access/access";

export class EmergencyAccessError extends Error {
  readonly code?: "not_found" | "forbidden" | "validation" | "conflict";

  constructor(
    message: string,
    options?: {
      code?: "not_found" | "forbidden" | "validation" | "conflict";
    },
  ) {
    super(message);
    this.name = "EmergencyAccessError";
    this.code = options?.code;
  }
}

function assertUserId(userId: string): void {
  if (!userId?.trim()) {
    throw new EmergencyAccessError("User id is required.", {
      code: "validation",
    });
  }
}

async function getUserEmail(userId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.email ? normalizeEmergencyEmail(row.email) : null;
}

async function applyTransitionIfNeeded(
  row: EmergencyAccessDesignation,
): Promise<EmergencyAccessDesignation> {
  const patch = computeEmergencyAccessTransition(row);
  if (!patch) return row;

  const db = getDb();
  const [updated] = await db
    .update(emergencyAccessDesignations)
    .set(patch)
    .where(eq(emergencyAccessDesignations.id, row.id))
    .returning();

  return updated ?? row;
}

async function notifyOwnerAccessRequested(
  row: EmergencyAccessDesignation,
): Promise<void> {
  const { translatorForUserId } = await import("@/lib/i18n/user-locale");
  const { t } = await translatorForUserId(row.ownerUserId);
  await createNotification({
    userId: row.ownerUserId,
    type: "emergency_access",
    title: t("notifications.emergencyAccess.requestedTitle"),
    message: t("notifications.emergencyAccess.requestedMessage", {
      name: row.designateeName,
    }),
    data: {
      designationId: row.id,
      action: "requested",
      designateeName: row.designateeName,
      link: "/documents/legacy/emergency",
    },
  });
}

async function notifyDesignateeGranted(
  row: EmergencyAccessDesignation,
): Promise<void> {
  if (!row.designateeUserId) return;
  const { translatorForUserId } = await import("@/lib/i18n/user-locale");
  const { t } = await translatorForUserId(row.designateeUserId);
  const accessPhrase =
    row.accessType === "permanent"
      ? t("notifications.emergencyAccess.accessPermanent")
      : t("notifications.emergencyAccess.accessTemporary");
  await createNotification({
    userId: row.designateeUserId,
    type: "emergency_access",
    title: t("notifications.emergencyAccess.grantedTitle"),
    message: t("notifications.emergencyAccess.grantedMessage", {
      access: accessPhrase,
    }),
    data: {
      designationId: row.id,
      action: "granted",
      ownerUserId: row.ownerUserId,
      link: "/emergency-access",
    },
  });
}

async function notifyDesignateeDenied(
  row: EmergencyAccessDesignation,
): Promise<void> {
  if (!row.designateeUserId) return;
  const { translatorForUserId } = await import("@/lib/i18n/user-locale");
  const { t } = await translatorForUserId(row.designateeUserId);
  await createNotification({
    userId: row.designateeUserId,
    type: "emergency_access",
    title: t("notifications.emergencyAccess.deniedTitle"),
    message: t("notifications.emergencyAccess.deniedMessage"),
    data: {
      designationId: row.id,
      action: "denied",
      ownerUserId: row.ownerUserId,
      link: "/emergency-access",
    },
  });
}

/** Link designatee_user_id when the authenticated email matches. */
export async function linkDesignateeUserIfMatched(
  designationId: string,
  userId: string,
): Promise<EmergencyAccessDesignation | null> {
  assertUserId(userId);
  const email = await getUserEmail(userId);
  if (!email) return null;

  const db = getDb();
  const [row] = await db
    .select()
    .from(emergencyAccessDesignations)
    .where(eq(emergencyAccessDesignations.id, designationId))
    .limit(1);

  if (!row || row.designateeEmail !== email) return null;
  if (row.designateeUserId === userId) return row;

  const [updated] = await db
    .update(emergencyAccessDesignations)
    .set({ designateeUserId: userId, updatedAt: new Date() })
    .where(eq(emergencyAccessDesignations.id, designationId))
    .returning();

  return updated ?? null;
}

export async function listOwnerEmergencyDesignations(
  ownerUserId: string,
): Promise<EmergencyAccessDesignation[]> {
  assertUserId(ownerUserId);
  const db = getDb();
  const rows = await db
    .select()
    .from(emergencyAccessDesignations)
    .where(eq(emergencyAccessDesignations.ownerUserId, ownerUserId))
    .orderBy(desc(emergencyAccessDesignations.updatedAt));

  return Promise.all(rows.map((row) => applyTransitionIfNeeded(row)));
}

export async function listIncomingEmergencyDesignations(
  userId: string,
): Promise<
  Array<EmergencyAccessDesignation & { ownerDisplayName: string | null }>
> {
  assertUserId(userId);
  const email = await getUserEmail(userId);
  if (!email) return [];

  const db = getDb();
  const rows = await db
    .select({
      designation: emergencyAccessDesignations,
      ownerDisplayName: users.displayName,
    })
    .from(emergencyAccessDesignations)
    .leftJoin(users, eq(emergencyAccessDesignations.ownerUserId, users.id))
    .where(
      or(
        eq(emergencyAccessDesignations.designateeUserId, userId),
        eq(emergencyAccessDesignations.designateeEmail, email),
      ),
    )
    .orderBy(desc(emergencyAccessDesignations.updatedAt));

  const result: Array<
    EmergencyAccessDesignation & { ownerDisplayName: string | null }
  > = [];

  for (const row of rows) {
    let designation = row.designation;
    if (designation.designateeUserId !== userId) {
      const linked = await linkDesignateeUserIfMatched(designation.id, userId);
      if (linked) designation = linked;
    }
    designation = await applyTransitionIfNeeded(designation);
    result.push({
      ...designation,
      ownerDisplayName: row.ownerDisplayName,
    });
  }

  return result;
}

export async function listActiveEmergencyGrants(
  designateeUserId: string,
): Promise<EmergencyAccessDesignation[]> {
  assertUserId(designateeUserId);
  const incoming = await listIncomingEmergencyDesignations(designateeUserId);
  return incoming.filter((row) => isEmergencyGrantActive(row));
}

export async function getOwnerEmergencyDesignation(
  designationId: string,
  ownerUserId: string,
): Promise<EmergencyAccessDesignation> {
  assertUserId(ownerUserId);
  const db = getDb();
  const [row] = await db
    .select()
    .from(emergencyAccessDesignations)
    .where(
      and(
        eq(emergencyAccessDesignations.id, designationId),
        eq(emergencyAccessDesignations.ownerUserId, ownerUserId),
      ),
    )
    .limit(1);

  if (!row) {
    throw new EmergencyAccessError("Emergency access designation not found.", {
      code: "not_found",
    });
  }

  return applyTransitionIfNeeded(row);
}

export async function getDesignateeEmergencyDesignation(
  designationId: string,
  userId: string,
): Promise<EmergencyAccessDesignation & { ownerDisplayName: string | null }> {
  assertUserId(userId);
  const email = await getUserEmail(userId);
  if (!email) {
    throw new EmergencyAccessError("Could not verify your account email.", {
      code: "forbidden",
    });
  }

  const db = getDb();
  const [row] = await db
    .select({
      designation: emergencyAccessDesignations,
      ownerDisplayName: users.displayName,
    })
    .from(emergencyAccessDesignations)
    .leftJoin(users, eq(emergencyAccessDesignations.ownerUserId, users.id))
    .where(eq(emergencyAccessDesignations.id, designationId))
    .limit(1);

  if (!row) {
    throw new EmergencyAccessError("Emergency access designation not found.", {
      code: "not_found",
    });
  }

  const emailMatches = row.designation.designateeEmail === email;
  const userMatches = row.designation.designateeUserId === userId;
  if (!emailMatches && !userMatches) {
    throw new EmergencyAccessError(
      "You are not the designated emergency contact for this vault.",
      { code: "forbidden" },
    );
  }

  let designation = row.designation;
  if (emailMatches && designation.designateeUserId !== userId) {
    const linked = await linkDesignateeUserIfMatched(designationId, userId);
    if (linked) designation = linked;
  }

  designation = await applyTransitionIfNeeded(designation);
  return { ...designation, ownerDisplayName: row.ownerDisplayName };
}

export async function getActiveEmergencyGrantForOwner(
  ownerUserId: string,
  designateeUserId: string,
): Promise<EmergencyAccessDesignation | null> {
  assertUserId(ownerUserId);
  assertUserId(designateeUserId);
  if (ownerUserId === designateeUserId) return null;

  const grants = await listActiveEmergencyGrants(designateeUserId);
  const match = grants.find((g) => g.ownerUserId === ownerUserId);
  return match ?? null;
}

export async function assertEmergencyLegacyReadAccess(
  ownerUserId: string,
  viewerUserId: string,
): Promise<"owner" | "granted_emergency"> {
  if (ownerUserId === viewerUserId) return "owner";

  const grant = await getActiveEmergencyGrantForOwner(ownerUserId, viewerUserId);
  if (grant && isEmergencyGrantActive(grant)) {
    return "granted_emergency";
  }

  throw new EmergencyAccessError(
    "Emergency access has not been granted for this vault.",
    { code: "forbidden" },
  );
}

export async function createEmergencyDesignation(
  input: CreateEmergencyAccessDesignationInput,
): Promise<EmergencyAccessDesignation> {
  assertUserId(input.ownerUserId);
  const email = normalizeEmergencyEmail(input.designateeEmail);
  if (!email || !email.includes("@")) {
    throw new EmergencyAccessError("A valid email is required.", {
      code: "validation",
    });
  }
  if (!input.designateeName.trim()) {
    throw new EmergencyAccessError("A name is required.", {
      code: "validation",
    });
  }

  const ownerEmail = await getUserEmail(input.ownerUserId);
  if (ownerEmail && ownerEmail === email) {
    throw new EmergencyAccessError(
      "You cannot designate yourself as an emergency contact.",
      { code: "validation" },
    );
  }

  const waitingPeriodHours =
    input.waitingPeriodHours ?? DEFAULT_WAITING_PERIOD_HOURS;
  const accessType = input.accessType ?? "temporary";
  const grantDurationDays =
    accessType === "permanent"
      ? TEMPORARY_GRANT_DURATION_DAYS
      : (input.grantDurationDays ?? TEMPORARY_GRANT_DURATION_DAYS);

  if (waitingPeriodHours < 0 || waitingPeriodHours > 24 * 30) {
    throw new EmergencyAccessError("Invalid waiting period.", {
      code: "validation",
    });
  }
  if (
    accessType === "temporary" &&
    (grantDurationDays < 1 || grantDurationDays > 365)
  ) {
    throw new EmergencyAccessError("Invalid grant duration.", {
      code: "validation",
    });
  }
  if (accessType !== "temporary" && accessType !== "permanent") {
    throw new EmergencyAccessError("Invalid access type.", {
      code: "validation",
    });
  }

  const db = getDb();
  const now = new Date();

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  try {
    const [row] = await db
      .insert(emergencyAccessDesignations)
      .values({
        id: nanoid(),
        ownerUserId: input.ownerUserId,
        designateeEmail: email,
        designateeUserId: existingUser?.id ?? null,
        designateeName: input.designateeName.trim(),
        relationship: input.relationship?.trim() || null,
        status: "designated",
        accessType,
        waitingPeriodHours,
        grantDurationDays,
        ownerNotes: input.ownerNotes?.trim() || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!row) {
      throw new EmergencyAccessError("Failed to create designation.", {
        code: "validation",
      });
    }

    if (row.designateeUserId) {
      const { translatorForUserId } = await import("@/lib/i18n/user-locale");
      const { t } = await translatorForUserId(row.designateeUserId);
      await createNotification({
        userId: row.designateeUserId,
        type: "emergency_access",
        title: t("notifications.emergencyAccess.designatedTitle"),
        message: t("notifications.emergencyAccess.designatedMessage"),
        data: {
          designationId: row.id,
          action: "designated",
          ownerUserId: row.ownerUserId,
          link: "/emergency-access",
        },
      });
    }

    return row;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("emergency_access_owner_email_uidx")
    ) {
      throw new EmergencyAccessError(
        "This email is already designated for emergency access.",
        { code: "conflict" },
      );
    }
    throw error;
  }
}

export async function updateEmergencyDesignation(
  designationId: string,
  ownerUserId: string,
  input: UpdateEmergencyAccessDesignationInput,
): Promise<EmergencyAccessDesignation> {
  const existing = await getOwnerEmergencyDesignation(designationId, ownerUserId);

  if (existing.status === "requested" || existing.status === "granted") {
    throw new EmergencyAccessError(
      "Cannot edit while a request is active or access is granted. Deny or revoke access first.",
      { code: "conflict" },
    );
  }

  let nextEmail: string | undefined;
  let nextDesignateeUserId: string | null | undefined;
  let emailChanged = false;

  if (input.designateeEmail !== undefined) {
    nextEmail = normalizeEmergencyEmail(input.designateeEmail);
    if (!nextEmail || !nextEmail.includes("@")) {
      throw new EmergencyAccessError("A valid email is required.", {
        code: "validation",
      });
    }

    const ownerEmail = await getUserEmail(ownerUserId);
    if (ownerEmail && ownerEmail === nextEmail) {
      throw new EmergencyAccessError(
        "You cannot designate yourself as an emergency contact.",
        { code: "validation" },
      );
    }

    if (nextEmail !== existing.designateeEmail) {
      emailChanged = true;
      const dbLookup = getDb();
      const [existingUser] = await dbLookup
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${nextEmail}`)
        .limit(1);
      nextDesignateeUserId = existingUser?.id ?? null;
    }
  }

  if (input.designateeName !== undefined && !input.designateeName.trim()) {
    throw new EmergencyAccessError("A name is required.", {
      code: "validation",
    });
  }

  const db = getDb();
  const nextAccessType = input.accessType ?? existing.accessType;
  let nextGrantDurationDays =
    input.grantDurationDays ?? existing.grantDurationDays;

  if (input.accessType === "permanent") {
    nextGrantDurationDays =
      input.grantDurationDays ??
      existing.grantDurationDays ??
      TEMPORARY_GRANT_DURATION_DAYS;
  } else if (
    nextAccessType === "temporary" &&
    input.grantDurationDays !== undefined &&
    (input.grantDurationDays < 1 || input.grantDurationDays > 365)
  ) {
    throw new EmergencyAccessError("Invalid grant duration.", {
      code: "validation",
    });
  }

  if (
    input.accessType !== undefined &&
    input.accessType !== "temporary" &&
    input.accessType !== "permanent"
  ) {
    throw new EmergencyAccessError("Invalid access type.", {
      code: "validation",
    });
  }

  // Email change (or edit while denied) should return the contact to a fresh
  // designated state so the new person can request access.
  const clearDeniedState =
    emailChanged || existing.status === "denied"
      ? {
          status: "designated" as const,
          requestedAt: null,
          waitingEndsAt: null,
          grantedAt: null,
          grantedBy: null,
          grantExpiresAt: null,
          deniedAt: null,
          denialReason: null,
        }
      : null;

  try {
    const [row] = await db
      .update(emergencyAccessDesignations)
      .set({
        ...(nextEmail !== undefined ? { designateeEmail: nextEmail } : {}),
        ...(nextDesignateeUserId !== undefined
          ? { designateeUserId: nextDesignateeUserId }
          : {}),
        ...(input.designateeName !== undefined
          ? { designateeName: input.designateeName.trim() }
          : {}),
        ...(input.relationship !== undefined
          ? { relationship: input.relationship?.trim() || null }
          : {}),
        ...(input.waitingPeriodHours !== undefined
          ? { waitingPeriodHours: input.waitingPeriodHours }
          : {}),
        ...(input.accessType !== undefined
          ? { accessType: input.accessType }
          : {}),
        ...(input.accessType !== undefined ||
        input.grantDurationDays !== undefined
          ? { grantDurationDays: nextGrantDurationDays }
          : {}),
        ...(input.ownerNotes !== undefined
          ? { ownerNotes: input.ownerNotes?.trim() || null }
          : {}),
        ...(clearDeniedState ?? {}),
        updatedAt: new Date(),
      })
      .where(eq(emergencyAccessDesignations.id, designationId))
      .returning();

    if (!row) {
      throw new EmergencyAccessError("Failed to update designation.", {
        code: "validation",
      });
    }

    if (
      emailChanged &&
      row.designateeUserId &&
      row.designateeUserId !== existing.designateeUserId
    ) {
      const { translatorForUserId } = await import("@/lib/i18n/user-locale");
      const { t } = await translatorForUserId(row.designateeUserId);
      await createNotification({
        userId: row.designateeUserId,
        type: "emergency_access",
        title: t("notifications.emergencyAccess.designatedTitle"),
        message: t("notifications.emergencyAccess.designatedMessage"),
        data: {
          designationId: row.id,
          action: "designated",
          ownerUserId: row.ownerUserId,
          link: "/emergency-access",
        },
      });
    }

    return row;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("emergency_access_owner_email_uidx")
    ) {
      throw new EmergencyAccessError(
        "This email is already designated for emergency access.",
        { code: "conflict" },
      );
    }
    throw error;
  }
}

export async function deleteEmergencyDesignation(
  designationId: string,
  ownerUserId: string,
): Promise<void> {
  await getOwnerEmergencyDesignation(designationId, ownerUserId);
  const db = getDb();
  const deleted = await db
    .delete(emergencyAccessDesignations)
    .where(
      and(
        eq(emergencyAccessDesignations.id, designationId),
        eq(emergencyAccessDesignations.ownerUserId, ownerUserId),
      ),
    )
    .returning({ id: emergencyAccessDesignations.id });

  if (!deleted.length) {
    throw new EmergencyAccessError("Emergency access designation not found.", {
      code: "not_found",
    });
  }
}

export async function requestEmergencyAccess(
  designationId: string,
  userId: string,
): Promise<EmergencyAccessDesignation> {
  const row = await getDesignateeEmergencyDesignation(designationId, userId);

  if (row.ownerUserId === userId) {
    throw new EmergencyAccessError("Owners cannot request access to their own vault.", {
      code: "forbidden",
    });
  }

  if (!canRequestEmergencyAccess(row)) {
    throw new EmergencyAccessError(
      "Access cannot be requested in the current state.",
      { code: "conflict" },
    );
  }

  const db = getDb();
  const patch = buildRequestPatch(row);
  const [updated] = await db
    .update(emergencyAccessDesignations)
    .set(patch)
    .where(eq(emergencyAccessDesignations.id, designationId))
    .returning();

  if (!updated) {
    throw new EmergencyAccessError("Failed to submit access request.", {
      code: "validation",
    });
  }

  await notifyOwnerAccessRequested(updated);
  return updated;
}

export async function grantEmergencyAccess(
  designationId: string,
  ownerUserId: string,
): Promise<EmergencyAccessDesignation> {
  const row = await getOwnerEmergencyDesignation(designationId, ownerUserId);

  if (!canOwnerGrant(row)) {
    throw new EmergencyAccessError("Access cannot be granted in the current state.", {
      code: "conflict",
    });
  }

  const db = getDb();
  // Re-read immediately before write so a concurrent edit (e.g. accessType)
  // is reflected in grantExpiresAt.
  const [fresh] = await db
    .select()
    .from(emergencyAccessDesignations)
    .where(
      and(
        eq(emergencyAccessDesignations.id, designationId),
        eq(emergencyAccessDesignations.ownerUserId, ownerUserId),
      ),
    )
    .limit(1);

  if (!fresh || !canOwnerGrant(fresh)) {
    throw new EmergencyAccessError("Access cannot be granted in the current state.", {
      code: "conflict",
    });
  }

  const patch = buildGrantPatch(fresh, "owner");
  const [updated] = await db
    .update(emergencyAccessDesignations)
    .set(patch)
    .where(
      and(
        eq(emergencyAccessDesignations.id, designationId),
        or(
          eq(emergencyAccessDesignations.status, "designated"),
          eq(emergencyAccessDesignations.status, "requested"),
        ),
      ),
    )
    .returning();

  if (!updated) {
    throw new EmergencyAccessError("Failed to grant access.", {
      code: "validation",
    });
  }

  await notifyDesignateeGranted(updated);
  return updated;
}

export async function denyEmergencyAccess(
  designationId: string,
  ownerUserId: string,
  reason?: string | null,
): Promise<EmergencyAccessDesignation> {
  const row = await getOwnerEmergencyDesignation(designationId, ownerUserId);

  if (!canOwnerDeny(row)) {
    throw new EmergencyAccessError("Only active requests can be denied.", {
      code: "conflict",
    });
  }

  const db = getDb();
  const patch = buildDenyPatch(reason);
  const [updated] = await db
    .update(emergencyAccessDesignations)
    .set(patch)
    .where(eq(emergencyAccessDesignations.id, designationId))
    .returning();

  if (!updated) {
    throw new EmergencyAccessError("Failed to deny access.", {
      code: "validation",
    });
  }

  await notifyDesignateeDenied(updated);
  return updated;
}

export async function resetEmergencyDesignation(
  designationId: string,
  ownerUserId: string,
): Promise<EmergencyAccessDesignation> {
  await getOwnerEmergencyDesignation(designationId, ownerUserId);

  const db = getDb();
  const [updated] = await db
    .update(emergencyAccessDesignations)
    .set(buildResetToDesignatedPatch())
    .where(eq(emergencyAccessDesignations.id, designationId))
    .returning();

  if (!updated) {
    throw new EmergencyAccessError("Failed to reset designation.", {
      code: "validation",
    });
  }
  return updated;
}
