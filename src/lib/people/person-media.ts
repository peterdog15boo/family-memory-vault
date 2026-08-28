/**
 * Canonical “media linked to this person and visible to the current user”.
 *
 * Rule (People list, Person detail, Ask AI person search — same source of truth):
 * 1. Face rows for this person under the viewer's userId (People stay private)
 * 2. Media must be clean + ready
 * 3. Media owner must be the viewer or an active family co-member
 *
 * Shared family photos assigned to the viewer's Person are included.
 * Unrelated accounts / non-clean media are never included.
 */

import { and, asc, countDistinct, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  faces,
  media,
  people,
  type Face,
  type Media,
} from "@/lib/db/schema";
import { loadCleanAccessibleMediaByIds } from "@/lib/media/queries";
import { getAccessibleOwnerIds } from "@/lib/permissions";
import { logger } from "@/lib/observability/logger";

const LOG = "people.person_media";

export type VisiblePersonMediaDebug = {
  personId: string;
  personName: string | null;
  /** Distinct clean/ready accessible media linked via the viewer's faces. */
  linkedMediaCount: number;
  linkedMediaIds: string[];
  ownedMediaCount: number;
  sharedMediaCount: number;
  /** Faces whose media passed the visibility gate. */
  visibleFaceCount: number;
  /** Faces linked to the person but excluded (not clean/ready or not accessible). */
  excludedFaceCount: number;
  sharedMediaIncluded: boolean;
  exclusionReasons: string[];
};

export type VisiblePersonMediaResult = {
  personId: string;
  mediaIds: string[];
  mediaRows: Media[];
  faces: Face[];
  debug: VisiblePersonMediaDebug;
};

export type ResolveVisiblePeopleMediaResult = {
  mediaIds: string[];
  perPerson: VisiblePersonMediaDebug[];
  sharedMediaIncluded: boolean;
  /** Why the combined set is empty, when applicable. */
  emptyReasons: string[];
};

/**
 * Load clean/ready media linked to one person and visible to the viewer.
 */
export async function listVisibleMediaLinkedToPerson(
  userId: string,
  personId: string,
): Promise<VisiblePersonMediaResult | null> {
  const db = getDb();
  const [person] = await db
    .select({ id: people.id, name: people.name, userId: people.userId })
    .from(people)
    .where(eq(people.id, personId))
    .limit(1);

  if (!person) return null;

  const { canViewPerson } = await import("@/lib/permissions");
  if (!(await canViewPerson(userId, personId))) return null;

  // Face labels for this identity live under the person owner's vault.
  const faceOwnerId = person.userId;

  const personFaces = await db
    .select()
    .from(faces)
    .where(and(eq(faces.personId, personId), eq(faces.userId, faceOwnerId)))
    .orderBy(asc(faces.createdAt));

  const linkedMediaIds = [...new Set(personFaces.map((f) => f.mediaId))];
  const mediaRows = await loadCleanAccessibleMediaByIds(userId, linkedMediaIds);
  const accessibleIds = new Set(mediaRows.map((row) => row.id));
  const visibleFaces = personFaces.filter((f) => accessibleIds.has(f.mediaId));
  const mediaIds = mediaRows.map((row) => row.id);

  const ownedMediaCount = mediaRows.filter((row) => row.userId === userId).length;
  const sharedMediaCount = mediaRows.length - ownedMediaCount;
  const excludedFaceCount = personFaces.length - visibleFaces.length;

  const exclusionReasons: string[] = [];
  if (personFaces.length === 0) {
    exclusionReasons.push("No faces linked to this person for the current user.");
  } else if (mediaIds.length === 0) {
    exclusionReasons.push(
      "Faces exist but none of their media are clean/ready and visible to the current user.",
    );
  }
  if (excludedFaceCount > 0) {
    exclusionReasons.push(
      `${excludedFaceCount} face(s) excluded because media is not clean/ready or not accessible.`,
    );
  }

  const debug: VisiblePersonMediaDebug = {
    personId,
    personName: person.name,
    linkedMediaCount: mediaIds.length,
    linkedMediaIds: mediaIds,
    ownedMediaCount,
    sharedMediaCount,
    visibleFaceCount: visibleFaces.length,
    excludedFaceCount,
    sharedMediaIncluded: sharedMediaCount > 0,
    exclusionReasons,
  };

  return {
    personId,
    mediaIds,
    mediaRows,
    faces: visibleFaces,
    debug,
  };
}

/**
 * Resolve visible linked media for one or more people (Ask AI + shared callers).
 * `any` = union; `all` = media that includes every listed person.
 */
export async function resolveVisibleMediaIdsForPeople(
  userId: string,
  peopleIds: string[],
  peopleMatch: "any" | "all" = "any",
): Promise<ResolveVisiblePeopleMediaResult> {
  const uniquePeopleIds = [
    ...new Set(peopleIds.map((id) => id.trim()).filter(Boolean)),
  ];
  const emptyReasons: string[] = [];
  const perPerson: VisiblePersonMediaDebug[] = [];

  if (uniquePeopleIds.length === 0) {
    return {
      mediaIds: [],
      perPerson: [],
      sharedMediaIncluded: false,
      emptyReasons: ["No people ids provided."],
    };
  }

  if (peopleMatch === "all" && uniquePeopleIds.length > 1) {
    // Same visibility rule, intersection via SQL for efficiency.
    const accessibleOwnerIds = await getAccessibleOwnerIds(userId);
    const db = getDb();
    const rows = await db
      .select({
        mediaId: faces.mediaId,
        personCount: countDistinct(faces.personId),
      })
      .from(faces)
      .innerJoin(
        media,
        and(
          eq(media.id, faces.mediaId),
          eq(media.moderationStatus, "clean"),
          eq(media.status, "ready"),
          inArray(media.userId, accessibleOwnerIds),
        ),
      )
      .where(
        and(eq(faces.userId, userId), inArray(faces.personId, uniquePeopleIds)),
      )
      .groupBy(faces.mediaId)
      .having(sql`count(distinct ${faces.personId}) = ${uniquePeopleIds.length}`);

    const mediaIds = rows.map((row) => row.mediaId);

    // Still gather per-person debug for logging.
    for (const personId of uniquePeopleIds) {
      const one = await listVisibleMediaLinkedToPerson(userId, personId);
      if (one) perPerson.push(one.debug);
      else {
        emptyReasons.push(`Person ${personId} not found for current user.`);
      }
    }

    if (mediaIds.length === 0) {
      emptyReasons.push(
        "No clean/ready accessible media includes all selected people together.",
      );
    }

    const sharedMediaIncluded = perPerson.some((p) => p.sharedMediaIncluded);
    return { mediaIds, perPerson, sharedMediaIncluded, emptyReasons };
  }

  const mediaIdSet = new Set<string>();
  for (const personId of uniquePeopleIds) {
    const one = await listVisibleMediaLinkedToPerson(userId, personId);
    if (!one) {
      emptyReasons.push(`Person ${personId} not found for current user.`);
      continue;
    }
    perPerson.push(one.debug);
    for (const id of one.mediaIds) mediaIdSet.add(id);
    if (one.mediaIds.length === 0) {
      emptyReasons.push(
        ...one.debug.exclusionReasons.map(
          (reason) => `${one.debug.personName ?? personId}: ${reason}`,
        ),
      );
    }
  }

  const mediaIds = [...mediaIdSet];
  const sharedMediaIncluded = perPerson.some((p) => p.sharedMediaIncluded);

  if (mediaIds.length === 0 && emptyReasons.length === 0) {
    emptyReasons.push("No visible linked media for the selected people.");
  }

  return { mediaIds, perPerson, sharedMediaIncluded, emptyReasons };
}

/**
 * Faces linked to a person whose media is clean/ready and visible to the viewer.
 * Prefer this over listFacesForPerson for matching / clustering so dirty or
 * inaccessible (non-family) media never influence identity decisions.
 */
export async function listVisibleFacesLinkedToPerson(
  userId: string,
  personId: string,
): Promise<Face[]> {
  const visible = await listVisibleMediaLinkedToPerson(userId, personId);
  return visible?.faces ?? [];
}

/**
 * Structured debug log for Ask AI / People person-media resolution.
 */
export function logPersonMediaResolution(input: {
  userId: string;
  source: string;
  peopleMatch?: "any" | "all";
  result: ResolveVisiblePeopleMediaResult;
}): void {
  const { result } = input;
  logger.info(LOG, {
    source: input.source,
    userId: input.userId,
    peopleMatch: input.peopleMatch ?? "any",
    linkedMediaCount: result.mediaIds.length,
    sharedMediaIncluded: result.sharedMediaIncluded,
    emptyReasons: result.emptyReasons,
    people: result.perPerson.map((p) => ({
      personId: p.personId,
      personName: p.personName,
      linkedMediaCount: p.linkedMediaCount,
      ownedMediaCount: p.ownedMediaCount,
      sharedMediaCount: p.sharedMediaCount,
      sharedMediaIncluded: p.sharedMediaIncluded,
      visibleFaceCount: p.visibleFaceCount,
      excludedFaceCount: p.excludedFaceCount,
      exclusionReasons: p.exclusionReasons,
    })),
  });
}
