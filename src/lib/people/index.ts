/**
 * Face grouping helpers — people identities and face assignments.
 *
 * Faces should only be created for the owner's media. Person records are
 * always scoped to userId. Detection / embedding providers come later.
 */

import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  faces,
  media,
  people,
  type Face,
  type Person,
} from "@/lib/db/schema";
import { isSafeToServe } from "@/lib/moderation/types";
import type { FaceBoundingBox, FaceEmbedding } from "@/lib/people/types";

export type { Face, Person, FaceBoundingBox, FaceEmbedding };

export class PeopleError extends Error {
  readonly code?: "plan_limit" | "not_found" | "validation";

  constructor(
    message: string,
    options?: { code?: "plan_limit" | "not_found" | "validation" },
  ) {
    super(message);
    this.name = "PeopleError";
    this.code = options?.code;
  }
}

const boundingBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().gt(0).max(1),
  height: z.number().gt(0).max(1),
});

export type CreatePersonInput = {
  userId: string;
  name: string;
  coverFaceId?: string | null;
};

export type CreateFaceInput = {
  userId: string;
  mediaId: string;
  boundingBox: FaceBoundingBox;
  embedding?: FaceEmbedding | null;
  faceToken?: string | null;
  confidence?: number | null;
  provider?: string | null;
  personId?: string | null;
  /** Video sample-frame offset in ms (null/omit for photos). */
  sourceFrameMs?: number | null;
};

export type PersonWithFaceCount = Person & {
  faceCount: number;
  /** Distinct media items this person appears in. */
  photoCount: number;
};

/** Auto-generated labels from grouping ("Person 3") → friendly display name. */
export function displayPersonName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || /^Person\s+\d+$/i.test(trimmed)) {
    return "Unnamed Person";
  }
  return trimmed;
}

/* -------------------------------------------------------------------------- */
/* People                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Create a person identity for the vault user.
 * Optional coverFaceId must already belong to the same user.
 */
export async function createPerson(
  input: CreatePersonInput,
): Promise<Person> {
  const name = input.name.trim();
  if (!name) {
    throw new PeopleError("Person name is required.", { code: "validation" });
  }
  if (name.length > 120) {
    throw new PeopleError("Person name is too long.", { code: "validation" });
  }

  const { canCreatePerson, PlanGateError } = await import("@/lib/plans/gates");
  try {
    const gate = await canCreatePerson(input.userId);
    if (!gate.allowed) {
      throw new PeopleError(
        gate.upgradeHint
          ? `${gate.reason} ${gate.upgradeHint}`
          : (gate.reason ?? "People limit reached."),
        { code: "plan_limit" },
      );
    }
  } catch (error) {
    if (error instanceof PeopleError) throw error;
    if (error instanceof PlanGateError) {
      throw new PeopleError(error.message, { code: "plan_limit" });
    }
    throw error;
  }

  const db = getDb();
  const now = new Date();
  const id = nanoid();

  const coverFaceId: string | null = input.coverFaceId ?? null;
  if (coverFaceId) {
    const [face] = await db
      .select()
      .from(faces)
      .where(and(eq(faces.id, coverFaceId), eq(faces.userId, input.userId)))
      .limit(1);
    if (!face) {
      throw new PeopleError("Cover face not found.");
    }
  }

  const [created] = await db
    .insert(people)
    .values({
      id,
      userId: input.userId,
      name,
      coverFaceId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (coverFaceId) {
    await db
      .update(faces)
      .set({ personId: id })
      .where(and(eq(faces.id, coverFaceId), eq(faces.userId, input.userId)));
  }

  return created;
}

/**
 * Rename a person (owner-scoped).
 */
export async function renamePerson(
  personId: string,
  userId: string,
  name: string,
): Promise<Person> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new PeopleError("Person name is required.");
  }
  if (trimmed.length > 120) {
    throw new PeopleError("Person name is too long.");
  }

  const db = getDb();
  const [updated] = await db
    .update(people)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(and(eq(people.id, personId), eq(people.userId, userId)))
    .returning();

  if (!updated) {
    throw new PeopleError("Person not found.");
  }
  return updated;
}

/**
 * Delete a person (owner-scoped). Photos stay in the vault.
 * Face detections are kept but unlabeled so the media is unchanged and
 * faces can be reassigned later.
 */
export async function deletePerson(
  personId: string,
  userId: string,
): Promise<{ deletedPersonId: string; unlabeledFaces: number }> {
  const person = await getPersonForUser(personId, userId);
  if (!person) {
    throw new PeopleError("Person not found.");
  }

  const db = getDb();
  const personFaces = await listFacesForPerson(personId, userId);

  // Clear cover first so the person row can be removed cleanly.
  await db
    .update(people)
    .set({ coverFaceId: null, updatedAt: new Date() })
    .where(and(eq(people.id, personId), eq(people.userId, userId)));

  let unlabeledFaces = 0;
  if (personFaces.length > 0) {
    const updated = await db
      .update(faces)
      .set({ personId: null })
      .where(
        and(
          eq(faces.userId, userId),
          eq(faces.personId, personId),
          inArray(
            faces.id,
            personFaces.map((f) => f.id),
          ),
        ),
      )
      .returning({ id: faces.id });
    unlabeledFaces = updated.length;
  }

  const deleted = await db
    .delete(people)
    .where(and(eq(people.id, personId), eq(people.userId, userId)))
    .returning({ id: people.id });

  if (deleted.length === 0) {
    throw new PeopleError("Person not found.");
  }

  return { deletedPersonId: personId, unlabeledFaces };
}

/**
 * Set (or clear) the cover face for a person.
 * Face must belong to this person and user.
 */
export async function setPersonCover(
  personId: string,
  userId: string,
  coverFaceId: string | null,
): Promise<Person> {
  const person = await getPersonForUser(personId, userId);
  if (!person) {
    throw new PeopleError("Person not found.");
  }

  const db = getDb();

  // Changing cover invalidates photo-specific framing — fall back to auto.
  const framingReset = {
    avatarFocusX: null,
    avatarFocusY: null,
    avatarZoom: null,
  };

  if (coverFaceId === null) {
    const [updated] = await db
      .update(people)
      .set({ coverFaceId: null, ...framingReset, updatedAt: new Date() })
      .where(and(eq(people.id, personId), eq(people.userId, userId)))
      .returning();
    if (!updated) {
      throw new PeopleError("Person not found.");
    }
    return updated;
  }

  const [face] = await db
    .select()
    .from(faces)
    .where(
      and(
        eq(faces.id, coverFaceId),
        eq(faces.userId, userId),
        eq(faces.personId, personId),
      ),
    )
    .limit(1);

  if (!face) {
    throw new PeopleError("Cover face must belong to this person.");
  }

  const [updated] = await db
    .update(people)
    .set({ coverFaceId, ...framingReset, updatedAt: new Date() })
    .where(and(eq(people.id, personId), eq(people.userId, userId)))
    .returning();

  if (!updated) {
    throw new PeopleError("Person not found.");
  }
  return updated;
}

export type SetPersonAvatarFramingInput = {
  /** Pass null to clear manual framing and restore face-auto crop. */
  avatarFocusX: number | null;
  avatarFocusY: number | null;
  avatarZoom: number | null;
};

/**
 * Save or clear manual avatar framing for a person.
 * All three must be null (auto) or all finite numbers within range.
 */
export async function setPersonAvatarFraming(
  personId: string,
  userId: string,
  input: SetPersonAvatarFramingInput,
): Promise<Person> {
  const person = await getPersonForUser(personId, userId);
  if (!person) {
    throw new PeopleError("Person not found.");
  }

  const { avatarFocusX, avatarFocusY, avatarZoom } = input;
  const clearing =
    avatarFocusX === null && avatarFocusY === null && avatarZoom === null;

  if (!clearing) {
    if (
      avatarFocusX == null ||
      avatarFocusY == null ||
      avatarZoom == null ||
      !Number.isFinite(avatarFocusX) ||
      !Number.isFinite(avatarFocusY) ||
      !Number.isFinite(avatarZoom) ||
      avatarFocusX < 0 ||
      avatarFocusX > 1 ||
      avatarFocusY < 0 ||
      avatarFocusY > 1 ||
      avatarZoom < 1 ||
      avatarZoom > 4
    ) {
      throw new PeopleError("Invalid avatar framing.", {
        code: "validation",
      });
    }
  }

  const db = getDb();
  const [updated] = await db
    .update(people)
    .set({
      avatarFocusX: clearing ? null : avatarFocusX,
      avatarFocusY: clearing ? null : avatarFocusY,
      avatarZoom: clearing ? null : avatarZoom,
      updatedAt: new Date(),
    })
    .where(and(eq(people.id, personId), eq(people.userId, userId)))
    .returning();

  if (!updated) {
    throw new PeopleError("Person not found.");
  }
  return updated;
}

/**
 * List people for a user (newest first) with face counts.
 */
export async function listPeopleForUser(
  userId: string,
): Promise<PersonWithFaceCount[]> {
  const db = getDb();

  const rows = await db
    .select({
      person: people,
      // Only faces on clean/ready media (matches People UI galleries).
      faceCount: sql<number>`cast(count(${media.id}) as int)`,
      photoCount: sql<number>`cast(count(distinct ${media.id}) as int)`,
    })
    .from(people)
    .leftJoin(
      faces,
      and(eq(faces.personId, people.id), eq(faces.userId, people.userId)),
    )
    .leftJoin(
      media,
      and(
        eq(media.id, faces.mediaId),
        eq(media.userId, people.userId),
        eq(media.moderationStatus, "clean"),
        eq(media.status, "ready"),
      ),
    )
    .where(eq(people.userId, userId))
    .groupBy(people.id)
    .orderBy(desc(people.updatedAt));

  return rows.map((row) => ({
    ...row.person,
    faceCount: Number(row.faceCount) || 0,
    photoCount: Number(row.photoCount) || 0,
  }));
}

/**
 * Load one person owned by userId, or null.
 */
export async function getPersonForUser(
  personId: string,
  userId: string,
): Promise<Person | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, personId), eq(people.userId, userId)))
    .limit(1);
  return row ?? null;
}

/* -------------------------------------------------------------------------- */
/* Faces                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Record a detected face on a media item owned by userId.
 * Media must be clean + ready (defense in depth — detection also gates).
 */
export async function createFace(input: CreateFaceInput): Promise<Face> {
  const box = boundingBoxSchema.safeParse(input.boundingBox);
  if (!box.success) {
    throw new PeopleError("Invalid face bounding box (expected normalized 0–1).");
  }

  const db = getDb();

  const [mediaRow] = await db
    .select()
    .from(media)
    .where(and(eq(media.id, input.mediaId), eq(media.userId, input.userId)))
    .limit(1);

  if (!mediaRow) {
    throw new PeopleError("Photo not found.");
  }

  if (!isSafeToServe(mediaRow.moderationStatus) || mediaRow.status !== "ready") {
    throw new PeopleError(
      "Faces can only be stored for clean, ready media.",
    );
  }

  if (mediaRow.type !== "photo" && mediaRow.type !== "video") {
    throw new PeopleError("Faces can only be stored for photos or videos.");
  }

  const personId: string | null = input.personId ?? null;
  if (personId) {
    const person = await getPersonForUser(personId, input.userId);
    if (!person) {
      throw new PeopleError("Person not found.");
    }
  }

  const [created] = await db
    .insert(faces)
    .values({
      id: nanoid(),
      userId: input.userId,
      mediaId: input.mediaId,
      personId,
      boundingBox: box.data,
      embedding: input.embedding ?? null,
      faceToken: input.faceToken ?? null,
      confidence: input.confidence ?? null,
      provider: input.provider ?? null,
      sourceFrameMs:
        input.sourceFrameMs != null && Number.isFinite(input.sourceFrameMs)
          ? Math.max(0, Math.round(input.sourceFrameMs))
          : null,
      createdAt: new Date(),
    })
    .returning();

  return created;
}

/**
 * Assign an existing face to a person (both must belong to userId).
 * Rejects if that person already has a different face on the same photo.
 */
export async function assignFaceToPerson(
  faceId: string,
  personId: string,
  userId: string,
): Promise<Face> {
  const db = getDb();

  const person = await getPersonForUser(personId, userId);
  if (!person) {
    throw new PeopleError("Person not found.");
  }

  const [face] = await db
    .select()
    .from(faces)
    .where(and(eq(faces.id, faceId), eq(faces.userId, userId)))
    .limit(1);

  if (!face) {
    throw new PeopleError("Face not found.");
  }

  const [alreadyOnMedia] = await db
    .select({ id: faces.id })
    .from(faces)
    .where(
      and(
        eq(faces.userId, userId),
        eq(faces.personId, personId),
        eq(faces.mediaId, face.mediaId),
        ne(faces.id, faceId),
      ),
    )
    .limit(1);

  if (alreadyOnMedia) {
    throw new PeopleError(
      "This person is already tagged in that photo. Pick a different face or person.",
    );
  }

  const [updated] = await db
    .update(faces)
    .set({ personId })
    .where(and(eq(faces.id, faceId), eq(faces.userId, userId)))
    .returning();

  if (!updated) {
    throw new PeopleError("Face not found.");
  }

  await db
    .update(people)
    .set({ updatedAt: new Date() })
    .where(and(eq(people.id, personId), eq(people.userId, userId)));

  // If the person has no cover yet, use this face.
  if (!person.coverFaceId) {
    await db
      .update(people)
      .set({ coverFaceId: faceId, updatedAt: new Date() })
      .where(and(eq(people.id, personId), eq(people.userId, userId)));
  }

  return updated;
}

/**
 * Move a face to another person, or unassign (personId null).
 * Enforces one face per person per photo.
 */
export async function reassignFace(
  faceId: string,
  personId: string | null,
  userId: string,
): Promise<Face> {
  if (personId === null) {
    return unassignFaceFromPerson(faceId, userId);
  }
  return assignFaceToPerson(faceId, personId, userId);
}

/**
 * Unassign a face from its person (owner-scoped).
 */
export async function unassignFaceFromPerson(
  faceId: string,
  userId: string,
): Promise<Face> {
  const db = getDb();

  const [existing] = await db
    .select()
    .from(faces)
    .where(and(eq(faces.id, faceId), eq(faces.userId, userId)))
    .limit(1);

  if (!existing) {
    throw new PeopleError("Face not found.");
  }

  const [updated] = await db
    .update(faces)
    .set({ personId: null })
    .where(and(eq(faces.id, faceId), eq(faces.userId, userId)))
    .returning();

  if (existing.personId) {
    const [person] = await db
      .select()
      .from(people)
      .where(
        and(eq(people.id, existing.personId), eq(people.userId, userId)),
      )
      .limit(1);

    if (person?.coverFaceId === faceId) {
      await db
        .update(people)
        .set({ coverFaceId: null, updatedAt: new Date() })
        .where(and(eq(people.id, person.id), eq(people.userId, userId)));
    } else if (person) {
      await db
        .update(people)
        .set({ updatedAt: new Date() })
        .where(and(eq(people.id, person.id), eq(people.userId, userId)));
    }
  }

  return updated!;
}

/**
 * Faces on a media item for the owner (ordered by creation).
 */
export async function listFacesForMedia(
  mediaId: string,
  userId: string,
): Promise<Face[]> {
  const db = getDb();
  return db
    .select()
    .from(faces)
    .where(and(eq(faces.mediaId, mediaId), eq(faces.userId, userId)))
    .orderBy(asc(faces.createdAt));
}

/**
 * Delete all face rows for a media item (owner-scoped).
 * Used when re-running detection with replaceExisting.
 */
export async function deleteFacesForMedia(
  mediaId: string,
  userId: string,
): Promise<number> {
  const db = getDb();
  const existing = await listFacesForMedia(mediaId, userId);
  const faceIds = existing.map((f) => f.id);

  if (faceIds.length === 0) {
    return 0;
  }

  // Clear any person covers that pointed at these faces.
  await db
    .update(people)
    .set({ coverFaceId: null, updatedAt: new Date() })
    .where(
      and(eq(people.userId, userId), inArray(people.coverFaceId, faceIds)),
    );

  const deleted = await db
    .delete(faces)
    .where(and(eq(faces.mediaId, mediaId), eq(faces.userId, userId)))
    .returning({ id: faces.id });

  return deleted.length;
}

/**
 * Faces assigned to a person (owner-scoped).
 */
export async function listFacesForPerson(
  personId: string,
  userId: string,
): Promise<Face[]> {
  const person = await getPersonForUser(personId, userId);
  if (!person) {
    throw new PeopleError("Person not found.");
  }

  const db = getDb();
  return db
    .select()
    .from(faces)
    .where(and(eq(faces.personId, personId), eq(faces.userId, userId)))
    .orderBy(asc(faces.createdAt));
}

/**
 * Detected faces not yet assigned to a person.
 */
export async function listUnassignedFaces(
  userId: string,
  limit = 100,
): Promise<Face[]> {
  const db = getDb();
  return db
    .select()
    .from(faces)
    .where(and(eq(faces.userId, userId), isNull(faces.personId)))
    .orderBy(desc(faces.createdAt))
    .limit(Math.min(Math.max(limit, 1), 500));
}

/**
 * Merge source person into target: move all faces, keep target name + cover,
 * delete the source person row. Both must belong to userId.
 *
 * Target identity always wins — name is never changed, and cover stays the
 * target's existing cover (or their pre-merge face if no cover was pinned).
 */
export async function mergePeople(
  targetPersonId: string,
  sourcePersonId: string,
  userId: string,
): Promise<Person> {
  if (targetPersonId === sourcePersonId) {
    throw new PeopleError("Cannot merge a person into themselves.");
  }

  const target = await getPersonForUser(targetPersonId, userId);
  const source = await getPersonForUser(sourcePersonId, userId);
  if (!target || !source) {
    throw new PeopleError("Person not found.");
  }

  const db = getDb();

  // Pin target cover BEFORE moving faces so source faces can't become the
  // "earliest" fallback cover after the merge.
  let coverFaceId = target.coverFaceId;
  if (!coverFaceId) {
    const [firstTargetFace] = await db
      .select({ id: faces.id })
      .from(faces)
      .where(and(eq(faces.personId, targetPersonId), eq(faces.userId, userId)))
      .orderBy(asc(faces.createdAt))
      .limit(1);
    coverFaceId = firstTargetFace?.id ?? null;
  }
  // Only if the target had no faces at all, borrow the source cover.
  if (!coverFaceId && source.coverFaceId) {
    coverFaceId = source.coverFaceId;
  }

  await db
    .update(faces)
    .set({ personId: targetPersonId })
    .where(and(eq(faces.personId, sourcePersonId), eq(faces.userId, userId)));

  // Name is intentionally omitted — target name must be preserved.
  await db
    .update(people)
    .set({
      coverFaceId,
      updatedAt: new Date(),
    })
    .where(and(eq(people.id, targetPersonId), eq(people.userId, userId)));

  await db
    .delete(people)
    .where(and(eq(people.id, sourcePersonId), eq(people.userId, userId)));

  const [updated] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, targetPersonId), eq(people.userId, userId)))
    .limit(1);

  if (!updated) {
    throw new PeopleError("Failed to load person after merge.");
  }
  return updated;
}

/**
 * All faces for a user (assigned + unassigned), newest first.
 */
export async function listAllFacesForUser(
  userId: string,
  limit = 2000,
): Promise<Face[]> {
  const db = getDb();
  return db
    .select()
    .from(faces)
    .where(eq(faces.userId, userId))
    .orderBy(desc(faces.createdAt))
    .limit(Math.min(Math.max(limit, 1), 5000));
}

/** Full-frame stand-in when the user assigns a photo with no detected face box. */
export const MANUAL_FACE_BOUNDING_BOX: FaceBoundingBox = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};

export type AssignMediaToPersonResult = {
  assigned: string[];
  alreadyAssigned: string[];
  skipped: { mediaId: string; reason: string }[];
};

/**
 * Manually attach clean/ready owner photos or videos to a person.
 *
 * Prefer reusing an unlabeled detected face on the media; otherwise create a
 * manual full-frame face link so assignment works when recognition missed them.
 */
export async function assignMediaToPerson(input: {
  userId: string;
  personId: string;
  mediaIds: string[];
}): Promise<AssignMediaToPersonResult> {
  const person = await getPersonForUser(input.personId, input.userId);
  if (!person) {
    throw new PeopleError("Person not found.", { code: "not_found" });
  }

  const uniqueIds = [
    ...new Set(input.mediaIds.map((id) => id.trim()).filter(Boolean)),
  ].slice(0, 50);

  if (uniqueIds.length === 0) {
    throw new PeopleError("Select at least one photo or video.", {
      code: "validation",
    });
  }

  const db = getDb();
  const assigned: string[] = [];
  const alreadyAssigned: string[] = [];
  const skipped: { mediaId: string; reason: string }[] = [];

  for (const mediaId of uniqueIds) {
    const [mediaRow] = await db
      .select()
      .from(media)
      .where(and(eq(media.id, mediaId), eq(media.userId, input.userId)))
      .limit(1);

    if (!mediaRow) {
      skipped.push({ mediaId, reason: "Media not found." });
      continue;
    }
    if (
      !isSafeToServe(mediaRow.moderationStatus) ||
      mediaRow.status !== "ready"
    ) {
      skipped.push({
        mediaId,
        reason: "Only clean, ready media can be added to a person.",
      });
      continue;
    }
    if (mediaRow.type !== "photo" && mediaRow.type !== "video") {
      skipped.push({
        mediaId,
        reason: "Only photos and videos can be added to a person.",
      });
      continue;
    }

    const [existingLink] = await db
      .select({ id: faces.id })
      .from(faces)
      .where(
        and(
          eq(faces.userId, input.userId),
          eq(faces.personId, input.personId),
          eq(faces.mediaId, mediaId),
        ),
      )
      .limit(1);

    if (existingLink) {
      alreadyAssigned.push(mediaId);
      continue;
    }

    const unlabeled = await db
      .select()
      .from(faces)
      .where(
        and(
          eq(faces.userId, input.userId),
          eq(faces.mediaId, mediaId),
          isNull(faces.personId),
        ),
      )
      .orderBy(desc(faces.confidence), asc(faces.createdAt));

    try {
      if (unlabeled[0]) {
        await assignFaceToPerson(
          unlabeled[0].id,
          input.personId,
          input.userId,
        );
      } else {
        const face = await createFace({
          userId: input.userId,
          mediaId,
          personId: input.personId,
          boundingBox: MANUAL_FACE_BOUNDING_BOX,
          provider: "manual",
          confidence: null,
        });
        // createFace does not set cover — mirror assignFaceToPerson behavior.
        const fresh = await getPersonForUser(input.personId, input.userId);
        if (fresh && !fresh.coverFaceId) {
          await db
            .update(people)
            .set({ coverFaceId: face.id, updatedAt: new Date() })
            .where(
              and(
                eq(people.id, input.personId),
                eq(people.userId, input.userId),
              ),
            );
        } else {
          await db
            .update(people)
            .set({ updatedAt: new Date() })
            .where(
              and(
                eq(people.id, input.personId),
                eq(people.userId, input.userId),
              ),
            );
        }
      }
      assigned.push(mediaId);
    } catch (error) {
      skipped.push({
        mediaId,
        reason:
          error instanceof PeopleError
            ? error.message
            : "Could not add this item.",
      });
    }
  }

  return { assigned, alreadyAssigned, skipped };
}

/**
 * Remove person tags from the given photos or videos (unassign matching faces).
 * Media files stay in the vault.
 */
export async function unassignMediaFromPerson(input: {
  userId: string;
  personId: string;
  mediaIds: string[];
}): Promise<{ unassignedMediaIds: string[]; unassignedFaceIds: string[] }> {
  const person = await getPersonForUser(input.personId, input.userId);
  if (!person) {
    throw new PeopleError("Person not found.", { code: "not_found" });
  }

  const uniqueIds = [
    ...new Set(input.mediaIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (uniqueIds.length === 0) {
    throw new PeopleError("Select at least one photo or video.", {
      code: "validation",
    });
  }

  const db = getDb();
  const linked = await db
    .select()
    .from(faces)
    .where(
      and(
        eq(faces.userId, input.userId),
        eq(faces.personId, input.personId),
        inArray(faces.mediaId, uniqueIds),
      ),
    );

  const unassignedFaceIds: string[] = [];
  const mediaSet = new Set<string>();

  for (const face of linked) {
    await unassignFaceFromPerson(face.id, input.userId);
    unassignedFaceIds.push(face.id);
    mediaSet.add(face.mediaId);
  }

  return {
    unassignedMediaIds: [...mediaSet],
    unassignedFaceIds,
  };
}
