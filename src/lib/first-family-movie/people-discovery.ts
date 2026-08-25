/**
 * People discovered on First Family Movie ritual photos.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { faces, media } from "@/lib/db/schema";
import { groupFaces } from "@/lib/faces/grouping";
import {
  groupFacesWithRekognitionIdentity,
  shouldUseRekognitionIdentity,
} from "@/lib/faces/identity-grouping";
import {
  listPeopleWithCovers,
  serializePersonListItem,
  type SerializedPersonListItem,
} from "@/lib/people/queries";

export type DiscoverPeopleResult = {
  people: SerializedPersonListItem[];
  /** Raw face detections on the ritual media (assigned or not). */
  faceCount: number;
  /** True when no faces yet — client may keep polling briefly. */
  detecting: boolean;
};

/**
 * List people who appear on the given owned media ids.
 * Ensures unassigned faces are grouped into Person identities first.
 */
export async function discoverPeopleFromMediaIds(
  userId: string,
  mediaIds: string[],
): Promise<DiscoverPeopleResult> {
  const uniqueIds = [
    ...new Set(mediaIds.map((id) => id.trim()).filter(Boolean)),
  ].slice(0, 60);

  if (uniqueIds.length === 0) {
    return { people: [], faceCount: 0, detecting: false };
  }

  const db = getDb();
  const owned = await db
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.userId, userId), inArray(media.id, uniqueIds)));
  const ownedIds = owned.map((r) => r.id);
  if (ownedIds.length === 0) {
    return { people: [], faceCount: 0, detecting: false };
  }

  const faceRows = await db
    .select({
      id: faces.id,
      personId: faces.personId,
      mediaId: faces.mediaId,
    })
    .from(faces)
    .where(and(eq(faces.userId, userId), inArray(faces.mediaId, ownedIds)));

  const faceCount = faceRows.length;
  if (faceCount === 0) {
    return { people: [], faceCount: 0, detecting: true };
  }

  const unassignedIds = faceRows
    .filter((f) => !f.personId)
    .map((f) => f.id);

  if (unassignedIds.length > 0) {
    try {
      if (shouldUseRekognitionIdentity()) {
        await groupFacesWithRekognitionIdentity(userId, unassignedIds);
      } else {
        await groupFaces(userId, unassignedIds);
      }
    } catch (error) {
      console.warn("[ffm.people] grouping failed", error);
    }
  }

  const refreshed = await db
    .select({ personId: faces.personId })
    .from(faces)
    .where(and(eq(faces.userId, userId), inArray(faces.mediaId, ownedIds)));

  const personIdSet = new Set(
    refreshed
      .map((r) => r.personId)
      .filter((id): id is string => Boolean(id)),
  );

  if (personIdSet.size === 0) {
    return { people: [], faceCount, detecting: false };
  }

  const all = await listPeopleWithCovers(userId);
  const people = all
    .filter((p) => personIdSet.has(p.id))
    .sort((a, b) => b.photoCount - a.photoCount || b.faceCount - a.faceCount)
    .map(serializePersonListItem);

  return { people, faceCount, detecting: false };
}
