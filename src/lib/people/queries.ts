/**
 * People list/detail enrichment — signed cover previews + clean photo galleries.
 * Only clean/ready media is exposed to the UI.
 */

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { faces, media, type Face, type Media } from "@/lib/db/schema";
import {
  cleanReadyMediaFilter,
  toSafeMediaItem,
  type SafeMediaItem,
} from "@/lib/media/queries";
import {
  displayPersonName,
  getPersonForUser,
  listPeopleForUser,
  type PersonWithFaceCount,
} from "@/lib/people";
import type { FaceBoundingBox } from "@/lib/people/types";

export type PersonCoverPreview = {
  faceId: string;
  mediaId: string;
  boundingBox: FaceBoundingBox;
  media: SafeMediaItem;
};

export type PersonListItem = PersonWithFaceCount & {
  displayName: string;
  cover: PersonCoverPreview | null;
};

export type PersonPhotoItem = SafeMediaItem & {
  /** Representative face on this photo for crop hints (cover or first). */
  faceId: string;
  boundingBox: FaceBoundingBox;
};

/** One detected face on a photo, with optional person label (for manual tagging). */
export type MediaFaceLabel = {
  faceId: string;
  mediaId: string;
  boundingBox: FaceBoundingBox;
  confidence: number | null;
  personId: string | null;
  personName: string | null;
  displayName: string;
  media: SafeMediaItem;
};

export type SerializedMediaFaceLabel = Omit<MediaFaceLabel, "media"> & {
  media: SerializedSafeMedia;
};

export type PersonDetail = PersonListItem & {
  photos: PersonPhotoItem[];
  /** Earliest clean photo createdAt (ISO-ready Date). */
  photoDateFrom: Date | null;
  /** Latest clean photo createdAt. */
  photoDateTo: Date | null;
};

export type SerializedPersonCover = Omit<PersonCoverPreview, "media"> & {
  media: SerializedSafeMedia;
};

export type SerializedSafeMedia = Omit<SafeMediaItem, "createdAt"> & {
  createdAt: string;
};

export type SerializedPersonListItem = Omit<
  PersonListItem,
  "createdAt" | "updatedAt" | "cover"
> & {
  createdAt: string;
  updatedAt: string;
  cover: SerializedPersonCover | null;
};

export type SerializedPersonPhoto = Omit<PersonPhotoItem, "createdAt"> & {
  createdAt: string;
};

export type SerializedPersonDetail = Omit<
  PersonDetail,
  "createdAt" | "updatedAt" | "cover" | "photos" | "photoDateFrom" | "photoDateTo"
> & {
  createdAt: string;
  updatedAt: string;
  cover: SerializedPersonCover | null;
  photos: SerializedPersonPhoto[];
  photoDateFrom: string | null;
  photoDateTo: string | null;
};

function serializeSafeMedia(item: SafeMediaItem): SerializedSafeMedia {
  return { ...item, createdAt: item.createdAt.toISOString() };
}

function serializeCover(
  cover: PersonCoverPreview | null,
): SerializedPersonCover | null {
  if (!cover) return null;
  return {
    faceId: cover.faceId,
    mediaId: cover.mediaId,
    boundingBox: cover.boundingBox,
    media: serializeSafeMedia(cover.media),
  };
}

export function serializePersonListItem(
  item: PersonListItem,
): SerializedPersonListItem {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    cover: serializeCover(item.cover),
  };
}

export function serializePersonDetail(
  item: PersonDetail,
): SerializedPersonDetail {
  return {
    ...serializePersonListItem(item),
    photos: item.photos.map((photo) => ({
      ...photo,
      createdAt: photo.createdAt.toISOString(),
    })),
    photoDateFrom: item.photoDateFrom
      ? item.photoDateFrom.toISOString()
      : null,
    photoDateTo: item.photoDateTo ? item.photoDateTo.toISOString() : null,
  };
}

export function serializeMediaFaceLabel(
  item: MediaFaceLabel,
): SerializedMediaFaceLabel {
  return {
    ...item,
    media: serializeSafeMedia(item.media),
  };
}

/**
 * All faces on a clean photo, with current person labels (owner-scoped).
 */
export async function listFacesForMediaLabeled(
  mediaId: string,
  userId: string,
): Promise<MediaFaceLabel[]> {
  const db = getDb();
  const mediaRows = await loadCleanOwnedMedia(userId, [mediaId]);
  if (mediaRows.length === 0) return [];

  const mediaById = await signMediaMap(mediaRows);
  const safe = mediaById.get(mediaId);
  if (!safe) return [];

  const faceRows = await db
    .select()
    .from(faces)
    .where(and(eq(faces.mediaId, mediaId), eq(faces.userId, userId)))
    .orderBy(asc(faces.createdAt));

  const personIds = [
    ...new Set(
      faceRows.map((f) => f.personId).filter((id): id is string => Boolean(id)),
    ),
  ];
  const peopleRows =
    personIds.length > 0 ? await listPeopleForUser(userId) : [];
  const peopleById = new Map(
    peopleRows.filter((p) => personIds.includes(p.id)).map((p) => [p.id, p]),
  );

  return faceRows.map((face) => {
    const person = face.personId ? peopleById.get(face.personId) : null;
    const name = person?.name ?? null;
    return {
      faceId: face.id,
      mediaId: face.mediaId,
      boundingBox: face.boundingBox,
      confidence: face.confidence,
      personId: face.personId,
      personName: name,
      displayName: name ? displayPersonName(name) : "Unlabeled",
      media: safe,
    };
  });
}

async function loadCleanOwnedMedia(
  userId: string,
  mediaIds: string[],
): Promise<Media[]> {
  if (mediaIds.length === 0) return [];
  const db = getDb();
  return db
    .select()
    .from(media)
    .where(and(cleanReadyMediaFilter(userId), inArray(media.id, mediaIds)));
}

async function signMediaMap(
  rows: Media[],
): Promise<Map<string, SafeMediaItem>> {
  const entries = await Promise.all(
    rows.map(async (row) => {
      const safe = await toSafeMediaItem(row);
      return safe ? ([row.id, safe] as const) : null;
    }),
  );
  return new Map(
    entries.filter((e): e is readonly [string, SafeMediaItem] => Boolean(e)),
  );
}

/**
 * Pick a cover face per person: preferred coverFaceId, else earliest face.
 * Only returns faces whose media is clean/ready (signed).
 */
async function resolveCoversForPeople(
  userId: string,
  peopleRows: PersonWithFaceCount[],
): Promise<Map<string, PersonCoverPreview>> {
  const result = new Map<string, PersonCoverPreview>();
  if (peopleRows.length === 0) return result;

  const preferredIds = peopleRows
    .map((p) => p.coverFaceId)
    .filter((id): id is string => Boolean(id));

  const db = getDb();

  const preferredFaces =
    preferredIds.length > 0
      ? await db
          .select()
          .from(faces)
          .where(
            and(eq(faces.userId, userId), inArray(faces.id, preferredIds)),
          )
      : [];

  const preferredById = new Map(preferredFaces.map((f) => [f.id, f]));

  const missingPersonIds = peopleRows
    .filter((p) => !p.coverFaceId || !preferredById.has(p.coverFaceId))
    .map((p) => p.id);

  let fallbackFaces: Face[] = [];
  if (missingPersonIds.length > 0) {
    fallbackFaces = await db
      .select()
      .from(faces)
      .where(
        and(
          eq(faces.userId, userId),
          inArray(faces.personId, missingPersonIds),
        ),
      )
      .orderBy(asc(faces.createdAt));
  }

  const firstFaceByPerson = new Map<string, Face>();
  for (const face of fallbackFaces) {
    if (face.personId && !firstFaceByPerson.has(face.personId)) {
      firstFaceByPerson.set(face.personId, face);
    }
  }

  const faceByPerson = new Map<string, Face>();
  for (const person of peopleRows) {
    const preferred =
      person.coverFaceId && preferredById.get(person.coverFaceId);
    const preferredOk =
      preferred &&
      (preferred.personId === person.id || preferred.personId == null);
    const face = preferredOk ? preferred : firstFaceByPerson.get(person.id);
    if (face) faceByPerson.set(person.id, face);
  }

  const mediaIds = [...new Set([...faceByPerson.values()].map((f) => f.mediaId))];
  const mediaRows = await loadCleanOwnedMedia(userId, mediaIds);
  const mediaById = await signMediaMap(mediaRows);

  for (const [personId, face] of faceByPerson) {
    const safe = mediaById.get(face.mediaId);
    if (!safe) continue;
    result.set(personId, {
      faceId: face.id,
      mediaId: face.mediaId,
      boundingBox: face.boundingBox,
      media: safe,
    });
  }

  return result;
}

export async function listPeopleWithCovers(
  userId: string,
): Promise<PersonListItem[]> {
  const peopleRows = await listPeopleForUser(userId);
  const covers = await resolveCoversForPeople(userId, peopleRows);

  return peopleRows.map((person) => ({
    ...person,
    displayName: displayPersonName(person.name),
    cover: covers.get(person.id) ?? null,
  }));
}

export async function getPersonWithPhotos(
  personId: string,
  userId: string,
): Promise<PersonDetail | null> {
  const person = await getPersonForUser(personId, userId);
  if (!person) return null;

  const db = getDb();
  /** Cap gallery size so person detail stays fast; newest photos first. */
  const PERSON_PHOTO_LIMIT = 100;
  const personFaces = await db
    .select()
    .from(faces)
    .where(and(eq(faces.personId, personId), eq(faces.userId, userId)))
    .orderBy(desc(faces.createdAt))
    .limit(PERSON_PHOTO_LIMIT * 3);

  const mediaIds = [...new Set(personFaces.map((f) => f.mediaId))];
  const mediaRows = await loadCleanOwnedMedia(userId, mediaIds);
  const mediaById = await signMediaMap(mediaRows);

  // One gallery tile per photo; prefer cover face bbox, else first face on that media.
  const faceForMedia = new Map<string, Face>();
  for (const face of personFaces) {
    if (person.coverFaceId && face.id === person.coverFaceId) {
      faceForMedia.set(face.mediaId, face);
    } else if (!faceForMedia.has(face.mediaId)) {
      faceForMedia.set(face.mediaId, face);
    }
  }

  const photos: PersonPhotoItem[] = [];
  for (const mediaId of mediaIds) {
    const safe = mediaById.get(mediaId);
    const face = faceForMedia.get(mediaId);
    if (!safe || !face) continue;
    photos.push({
      ...safe,
      faceId: face.id,
      boundingBox: face.boundingBox,
    });
  }

  // Newest first in the gallery; hard-cap distinct photos.
  photos.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  if (photos.length > PERSON_PHOTO_LIMIT) {
    photos.length = PERSON_PHOTO_LIMIT;
  }

  let photoDateFrom: Date | null = null;
  let photoDateTo: Date | null = null;
  for (const photo of photos) {
    if (!photoDateFrom || photo.createdAt < photoDateFrom) {
      photoDateFrom = photo.createdAt;
    }
    if (!photoDateTo || photo.createdAt > photoDateTo) {
      photoDateTo = photo.createdAt;
    }
  }

  const listShape: PersonWithFaceCount = {
    ...person,
    faceCount: personFaces.length,
    photoCount: photos.length,
  };
  const covers = await resolveCoversForPeople(userId, [listShape]);

  return {
    ...listShape,
    displayName: displayPersonName(person.name),
    cover: covers.get(person.id) ?? null,
    photos,
    photoDateFrom,
    photoDateTo,
  };
}
