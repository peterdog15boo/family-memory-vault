/**
 * Family photo contribution requests — ask a member/invitee to upload photos.
 * Never exposes the requester’s private library on the deep-link surface.
 */

import { and, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import {
  families,
  familyMembers,
  photoRequests,
  users,
  type PhotoRequest,
  type PhotoRequestStatus,
} from "@/lib/db/schema";
import { getAppUrl } from "@/lib/env";
import { buildFamilyInviteLink } from "@/lib/families/invite-link";
import { DEFAULT_PHOTO_REQUEST_MESSAGE } from "@/lib/photo-requests/copy";

export {
  DEFAULT_PHOTO_REQUEST_MESSAGE,
  PHOTO_REQUEST_PRESETS,
} from "@/lib/photo-requests/copy";

class PhotoRequestError extends Error {
  code: "validation" | "forbidden" | "not_found";
  constructor(
    message: string,
    code: "validation" | "forbidden" | "not_found" = "validation",
  ) {
    super(message);
    this.name = "PhotoRequestError";
    this.code = code;
  }
}

export { PhotoRequestError };

export type SerializedPhotoRequest = {
  id: string;
  familyId: string;
  familyName: string;
  requestedByUserId: string;
  requesterName: string | null;
  targetMemberId: string;
  targetEmail: string;
  targetDisplayName: string | null;
  targetStatus: string;
  memoryId: string | null;
  personId: string | null;
  message: string;
  status: PhotoRequestStatus;
  token: string;
  uploadUrl: string;
  completedAt: string | null;
  createdAt: string;
};

function buildUploadDeepLink(token: string): string {
  const url = new URL("/upload", getAppUrl());
  url.searchParams.set("request", token);
  return url.toString();
}

/**
 * Absolute link for the target: pending invitees go through accept first.
 */
export function buildPhotoRequestDeepLink(input: {
  requestToken: string;
  inviteToken: string | null;
  targetHasUser: boolean;
}): string {
  const upload = buildUploadDeepLink(input.requestToken);
  if (input.targetHasUser || !input.inviteToken) {
    return upload;
  }
  const accept = new URL(buildFamilyInviteLink(input.inviteToken));
  accept.searchParams.set("next", `/upload?request=${encodeURIComponent(input.requestToken)}`);
  return accept.toString();
}

async function assertCanRequest(
  userId: string,
  familyId: string,
): Promise<{ role: string }> {
  const db = getDb();
  const [membership] = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.familyId, familyId),
        eq(familyMembers.userId, userId),
        eq(familyMembers.status, "active"),
      ),
    )
    .limit(1);

  if (!membership || (membership.role !== "owner" && membership.role !== "member")) {
    throw new PhotoRequestError(
      "Only family owners and members can request photos.",
      "forbidden",
    );
  }
  return { role: membership.role };
}

export async function createPhotoRequest(input: {
  familyId: string;
  requestedByUserId: string;
  targetMemberId: string;
  message?: string;
  memoryId?: string | null;
  personId?: string | null;
}): Promise<{
  request: PhotoRequest;
  deepLink: string;
  serialized: SerializedPhotoRequest;
}> {
  const familyId = input.familyId.trim();
  const requestedByUserId = input.requestedByUserId.trim();
  const targetMemberId = input.targetMemberId.trim();
  const message = (input.message?.trim() || DEFAULT_PHOTO_REQUEST_MESSAGE).slice(
    0,
    500,
  );

  if (!familyId || !requestedByUserId || !targetMemberId) {
    throw new PhotoRequestError("Family, requester, and target are required.");
  }

  await assertCanRequest(requestedByUserId, familyId);

  const db = getDb();
  const [target] = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.id, targetMemberId),
        eq(familyMembers.familyId, familyId),
        inArray(familyMembers.status, ["pending", "active"]),
      ),
    )
    .limit(1);

  if (!target) {
    throw new PhotoRequestError("That family member wasn’t found.", "not_found");
  }
  if (target.userId && target.userId === requestedByUserId) {
    throw new PhotoRequestError("You can’t request photos from yourself.");
  }

  const [family] = await db
    .select()
    .from(families)
    .where(eq(families.id, familyId))
    .limit(1);
  if (!family) {
    throw new PhotoRequestError("Family not found.", "not_found");
  }

  const [requester] = await db
    .select({
      displayName: users.displayName,
    })
    .from(users)
    .where(eq(users.id, requestedByUserId))
    .limit(1);

  const now = new Date();
  const token = nanoid(24);
  const [created] = await db
    .insert(photoRequests)
    .values({
      id: nanoid(),
      familyId,
      requestedByUserId,
      targetMemberId,
      memoryId: input.memoryId?.trim() || null,
      personId: input.personId?.trim() || null,
      message,
      status: "pending",
      token,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!created) {
    throw new PhotoRequestError("Could not create the photo request.");
  }

  const deepLink = buildPhotoRequestDeepLink({
    requestToken: token,
    inviteToken: target.inviteToken,
    targetHasUser: Boolean(target.userId),
  });

  const serialized = serializePhotoRequestRow({
    request: created,
    familyName: family.name,
    requesterName: requester?.displayName ?? null,
    target,
  });

  // Notify active members with accounts; pending invitees get email via caller.
  if (target.userId) {
    try {
      const { notifyPhotoRequest } = await import("@/lib/notifications");
      await notifyPhotoRequest(target.userId, {
        requestId: created.id,
        familyId,
        familyName: family.name,
        requesterName: requester?.displayName ?? undefined,
        message,
        link: `/upload?request=${encodeURIComponent(token)}`,
      });
    } catch (error) {
      console.error("[photo-requests] notify failed", error);
    }
  }

  return { request: created, deepLink, serialized };
}

function serializePhotoRequestRow(input: {
  request: PhotoRequest;
  familyName: string;
  requesterName: string | null;
  target: {
    id: string;
    invitedEmail: string;
    status: string;
    userId: string | null;
  };
  targetDisplayName?: string | null;
}): SerializedPhotoRequest {
  const { request, familyName, requesterName, target } = input;
  return {
    id: request.id,
    familyId: request.familyId,
    familyName,
    requestedByUserId: request.requestedByUserId,
    requesterName,
    targetMemberId: request.targetMemberId,
    targetEmail: target.invitedEmail,
    targetDisplayName: input.targetDisplayName ?? null,
    targetStatus: target.status,
    memoryId: request.memoryId,
    personId: request.personId,
    message: request.message,
    status: request.status as PhotoRequestStatus,
    token: request.token,
    uploadUrl: buildUploadDeepLink(request.token),
    completedAt: request.completedAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
  };
}

export async function listPhotoRequestsForFamily(
  familyId: string,
  viewerUserId: string,
): Promise<SerializedPhotoRequest[]> {
  await assertCanRequest(viewerUserId, familyId);
  const db = getDb();

  const rows = await db
    .select({
      request: photoRequests,
      familyName: families.name,
      targetEmail: familyMembers.invitedEmail,
      targetStatus: familyMembers.status,
      targetUserId: familyMembers.userId,
      requesterName: users.displayName,
    })
    .from(photoRequests)
    .innerJoin(families, eq(photoRequests.familyId, families.id))
    .innerJoin(
      familyMembers,
      eq(photoRequests.targetMemberId, familyMembers.id),
    )
    .leftJoin(users, eq(photoRequests.requestedByUserId, users.id))
    .where(eq(photoRequests.familyId, familyId))
    .orderBy(desc(photoRequests.createdAt))
    .limit(40);

  return rows.map((row) =>
    serializePhotoRequestRow({
      request: row.request,
      familyName: row.familyName,
      requesterName: row.requesterName,
      target: {
        id: row.request.targetMemberId,
        invitedEmail: row.targetEmail,
        status: row.targetStatus,
        userId: row.targetUserId,
      },
    }),
  );
}

/**
 * Resolve a request token for the upload page banner (auth user must match target).
 */
export async function getPhotoRequestForUpload(
  token: string,
  viewerUserId: string,
): Promise<{
  id: string;
  message: string;
  familyName: string;
  requesterName: string | null;
  status: PhotoRequestStatus;
} | null> {
  const trimmed = token?.trim();
  if (!trimmed || !viewerUserId) return null;

  const db = getDb();
  const [row] = await db
    .select({
      request: photoRequests,
      familyName: families.name,
      targetUserId: familyMembers.userId,
      targetEmail: familyMembers.invitedEmail,
      requesterName: users.displayName,
    })
    .from(photoRequests)
    .innerJoin(families, eq(photoRequests.familyId, families.id))
    .innerJoin(
      familyMembers,
      eq(photoRequests.targetMemberId, familyMembers.id),
    )
    .leftJoin(users, eq(photoRequests.requestedByUserId, users.id))
    .where(eq(photoRequests.token, trimmed))
    .limit(1);

  if (!row) return null;
  if (row.request.status !== "pending") {
    return {
      id: row.request.id,
      message: row.request.message,
      familyName: row.familyName,
      requesterName: row.requesterName,
      status: row.request.status as PhotoRequestStatus,
    };
  }

  // Target must be this user (by membership userId).
  if (row.targetUserId && row.targetUserId !== viewerUserId) {
    return null;
  }

  return {
    id: row.request.id,
    message: row.request.message,
    familyName: row.familyName,
    requesterName: row.requesterName,
    status: "pending",
  };
}

/**
 * Mark pending requests complete when the target user uploads clean/ready media.
 */
export async function completePhotoRequestsForUploader(
  userId: string,
): Promise<number> {
  if (!userId?.trim()) return 0;
  const db = getDb();

  const memberships = await db
    .select({ id: familyMembers.id })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.userId, userId),
        eq(familyMembers.status, "active"),
      ),
    );

  if (memberships.length === 0) return 0;
  const memberIds = memberships.map((m) => m.id);

  const pending = await db
    .select()
    .from(photoRequests)
    .where(
      and(
        eq(photoRequests.status, "pending"),
        inArray(photoRequests.targetMemberId, memberIds),
      ),
    );

  if (pending.length === 0) return 0;

  const now = new Date();
  await db
    .update(photoRequests)
    .set({
      status: "completed",
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(photoRequests.status, "pending"),
        inArray(
          photoRequests.id,
          pending.map((p) => p.id),
        ),
      ),
    );

  return pending.length;
}

export async function cancelPhotoRequest(
  requestId: string,
  userId: string,
): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(photoRequests)
    .where(eq(photoRequests.id, requestId))
    .limit(1);
  if (!row) {
    throw new PhotoRequestError("Request not found.", "not_found");
  }
  await assertCanRequest(userId, row.familyId);
  if (row.requestedByUserId !== userId) {
    const [membership] = await db
      .select()
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.familyId, row.familyId),
          eq(familyMembers.userId, userId),
          eq(familyMembers.status, "active"),
          eq(familyMembers.role, "owner"),
        ),
      )
      .limit(1);
    if (!membership) {
      throw new PhotoRequestError("Only the requester or owner can cancel.", "forbidden");
    }
  }

  const now = new Date();
  await db
    .update(photoRequests)
    .set({
      status: "cancelled",
      cancelledAt: now,
      updatedAt: now,
    })
    .where(eq(photoRequests.id, requestId));
}
