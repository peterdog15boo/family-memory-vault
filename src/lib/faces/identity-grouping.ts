/**
 * Group faces using Rekognition Face Collections (real identity matching).
 *
 * Prefer this over embedding/bbox scoring when FACE_DETECTION_PROVIDER=rekognition.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { faces, people } from "@/lib/db/schema";
import type { GroupFaceDecision, GroupFacesResult } from "@/lib/faces/grouping";
import {
  cropFaceRecord,
  getIdentityMatchThreshold,
  indexFaceIdentity,
  resetFaceCollection,
  searchIdentityByCrop,
  searchIdentityByFaceId,
} from "@/lib/faces/rekognition-identity";
import {
  assignFaceToPerson,
  createPerson,
  getPersonForUser,
  listAllFacesForUser,
  listFacesForPerson,
  listPeopleForUser,
  mergePeople,
  unassignFaceFromPerson,
} from "@/lib/people";
import { listVisibleFacesLinkedToPerson } from "@/lib/people/person-media";

const LOG = "[faces.identity-grouping]";

function nextPersonLabel(existingCount: number): string {
  return `Person ${existingCount + 1}`;
}

/**
 * Assign faces to people via SearchFacesByImage against a per-user collection.
 * Faces without a usable crop/search still get their own person + IndexFaces.
 */
export async function groupFacesWithRekognitionIdentity(
  userId: string,
  faceIds: string[],
): Promise<GroupFacesResult> {
  const uniqueIds = [...new Set(faceIds.filter(Boolean))];
  const threshold = getIdentityMatchThreshold();
  const decisions: GroupFaceDecision[] = [];
  let assigned = 0;
  let created = 0;
  let skipped = 0;

  if (uniqueIds.length === 0) {
    return { userId, decisions, assigned, created, skipped };
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(faces)
    .where(and(eq(faces.userId, userId), inArray(faces.id, uniqueIds)));

  const byId = new Map(rows.map((f) => [f.id, f]));
  // faceId → personId map grows as we assign within this batch.
  const personByFaceId = new Map<string, string>();
  // personId → mediaIds they already appear on (one face per person per photo).
  const mediaIdsByPerson = new Map<string, Set<string>>();

  function notePersonOnMedia(personId: string, mediaId: string) {
    const set = mediaIdsByPerson.get(personId) ?? new Set<string>();
    set.add(mediaId);
    mediaIdsByPerson.set(personId, set);
  }

  function personAlreadyOnMedia(personId: string, mediaId: string): boolean {
    return mediaIdsByPerson.get(personId)?.has(mediaId) ?? false;
  }

  // Seed with already-assigned faces on clean/ready accessible media only.
  const existingPeople = await listPeopleForUser(userId);
  for (const person of existingPeople) {
    const personFaces = await listVisibleFacesLinkedToPerson(userId, person.id);
    for (const f of personFaces) {
      personByFaceId.set(f.id, person.id);
      notePersonOnMedia(person.id, f.mediaId);
    }
  }

  let personCount = existingPeople.length;

  console.info(`${LOG} identity grouping start`, {
    userId,
    faces: uniqueIds.length,
    threshold,
    existingPeople: personCount,
  });

  for (const faceId of uniqueIds) {
    const face = byId.get(faceId);
    if (!face) {
      decisions.push({
        action: "skipped",
        faceId,
        reason: "Face not found for this user.",
      });
      skipped += 1;
      continue;
    }

    if (face.personId) {
      decisions.push({
        action: "skipped",
        faceId,
        reason: "Face already assigned to a person.",
      });
      skipped += 1;
      continue;
    }

    let crop: Buffer;
    try {
      crop = await cropFaceRecord(face);
    } catch (error) {
      console.error(`${LOG} crop failed`, { faceId, error });
      // Fall back: still create a person so the face isn't lost.
      let person;
      try {
        person = await createPerson({
          userId,
          name: nextPersonLabel(personCount),
        });
      } catch (createErr) {
        if (
          createErr instanceof Error &&
          createErr.name === "PeopleError" &&
          (createErr as { code?: string }).code === "plan_limit"
        ) {
          decisions.push({
            action: "skipped",
            faceId,
            reason: createErr.message,
          });
          skipped += 1;
          continue;
        }
        throw createErr;
      }
      personCount += 1;
      await assignFaceToPerson(face.id, person.id, userId);
      personByFaceId.set(face.id, person.id);
      notePersonOnMedia(person.id, face.mediaId);
      decisions.push({
        action: "created",
        faceId: face.id,
        personId: person.id,
        personName: person.name,
        score: 0,
      });
      created += 1;
      continue;
    }

    let hit: Awaited<ReturnType<typeof searchIdentityByCrop>> = null;
    try {
      hit = await searchIdentityByCrop(userId, crop, threshold);
    } catch (error) {
      console.warn(`${LOG} search failed — creating new person`, {
        faceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (hit) {
      const matchedPersonId = personByFaceId.get(hit.matchedFaceId);
      let personId = matchedPersonId ?? null;

      if (!personId) {
        // Matched face may exist in collection but map miss — load from DB.
        const [matchedFace] = await db
          .select()
          .from(faces)
          .where(
            and(eq(faces.id, hit.matchedFaceId), eq(faces.userId, userId)),
          )
          .limit(1);
        personId = matchedFace?.personId ?? null;
        if (personId) personByFaceId.set(hit.matchedFaceId, personId);
      }

      // Same person cannot appear twice in one photo — reject false matches.
      if (personId && personAlreadyOnMedia(personId, face.mediaId)) {
        console.info(`${LOG} rejecting match — person already on this media`, {
          faceId: face.id,
          mediaId: face.mediaId,
          personId,
          matchedFaceId: hit.matchedFaceId,
          similarity: hit.similarity,
        });
        hit = null;
        personId = null;
      }

      // Require a strong match; weaker hits become new people.
      if (hit && hit.similarity < threshold) {
        console.info(`${LOG} rejecting weak match`, {
          faceId: face.id,
          similarity: hit.similarity,
          threshold,
        });
        hit = null;
        personId = null;
      }

      if (personId) {
        const person = await getPersonForUser(personId, userId);
        let assignedOk = false;
        if (person) {
          try {
            await assignFaceToPerson(face.id, person.id, userId);
            assignedOk = true;
          } catch (error) {
            console.warn(`${LOG} assign rejected — creating new person`, {
              faceId: face.id,
              personId: person.id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        if (assignedOk && person) {
          try {
            await indexFaceIdentity(userId, face, crop);
          } catch (error) {
            console.warn(`${LOG} index after assign failed`, { faceId, error });
          }
          personByFaceId.set(face.id, person.id);
          notePersonOnMedia(person.id, face.mediaId);
          decisions.push({
            action: "assigned",
            faceId: face.id,
            personId: person.id,
            personName: person.name,
            score: hit!.similarity / 100,
          });
          assigned += 1;
          continue;
        }
      }
    }

    // No reliable match → new person + index into collection.
    let person;
    try {
      person = await createPerson({
        userId,
        name: nextPersonLabel(personCount),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "PeopleError" &&
        (error as { code?: string }).code === "plan_limit"
      ) {
        decisions.push({
          action: "skipped",
          faceId: face.id,
          reason: error.message,
        });
        skipped += 1;
        continue;
      }
      throw error;
    }
    personCount += 1;
    await assignFaceToPerson(face.id, person.id, userId);
    try {
      await indexFaceIdentity(userId, face, crop);
    } catch (error) {
      console.warn(`${LOG} index for new person failed`, { faceId, error });
    }
    personByFaceId.set(face.id, person.id);
    notePersonOnMedia(person.id, face.mediaId);
    decisions.push({
      action: "created",
      faceId: face.id,
      personId: person.id,
      personName: person.name,
      score: hit?.similarity ? hit.similarity / 100 : 0,
    });
    created += 1;
  }

  console.info(`${LOG} identity grouping complete`, {
    userId,
    assigned,
    created,
    skipped,
  });

  return { userId, decisions, assigned, created, skipped };
}

/**
 * Second pass: merge people whose indexed faces match via SearchFaces.
 * Catches duplicates the sequential SearchFacesByImage pass missed.
 */
export async function consolidatePeopleWithRekognitionIdentity(
  userId: string,
): Promise<{ merges: number }> {
  const threshold = getIdentityMatchThreshold();
  const all = await listAllFacesForUser(userId, 5000);
  const indexed = all.filter((f) => f.faceToken && f.personId);

  // Union-find over person ids.
  const parent = new Map<string, string>();
  function find(id: string): string {
    let cur = id;
    while (parent.get(cur) && parent.get(cur) !== cur) {
      cur = parent.get(cur)!;
    }
    parent.set(id, cur);
    return cur;
  }
  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    // Prefer keeping the lexicographically smaller root for stability.
    if (ra < rb) parent.set(rb, ra);
    else parent.set(ra, rb);
  }

  for (const face of indexed) {
    if (face.personId) parent.set(face.personId, face.personId);
  }

  console.info(`${LOG} consolidate start`, {
    userId,
    indexed: indexed.length,
    threshold,
  });

  for (const face of indexed) {
    if (!face.faceToken || !face.personId) continue;
    let hits: Awaited<ReturnType<typeof searchIdentityByFaceId>> = [];
    try {
      hits = await searchIdentityByFaceId(userId, face.faceToken, threshold);
    } catch (error) {
      console.warn(`${LOG} SearchFaces failed`, {
        faceId: face.id,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    for (const hit of hits) {
      const matched = all.find((f) => f.id === hit.matchedFaceId);
      if (!matched?.personId || !face.personId) continue;
      if (matched.personId === face.personId) continue;

      // Never consolidate two people who both appear in the same photo.
      const faceMedia = new Set(
        all.filter((f) => f.personId === face.personId).map((f) => f.mediaId),
      );
      const matchedMedia = all
        .filter((f) => f.personId === matched.personId)
        .map((f) => f.mediaId);
      if (matchedMedia.some((m) => faceMedia.has(m))) {
        continue;
      }

      union(face.personId, matched.personId);
    }
  }

  // Group person ids by root.
  const clusters = new Map<string, Set<string>>();
  for (const personId of parent.keys()) {
    const root = find(personId);
    const set = clusters.get(root) ?? new Set<string>();
    set.add(personId);
    clusters.set(root, set);
  }

  let merges = 0;
  for (const [root, members] of clusters) {
    if (members.size < 2) continue;
    const targetId = root;
    for (const sourceId of members) {
      if (sourceId === targetId) continue;
      try {
        // Re-check both still exist (prior merges may have deleted sources).
        const target = await getPersonForUser(targetId, userId);
        const source = await getPersonForUser(sourceId, userId);
        if (!target || !source) continue;
        await mergePeople(targetId, sourceId, userId);
        merges += 1;
        console.info(`${LOG} consolidated people`, {
          targetId,
          sourceId,
        });
      } catch (error) {
        console.warn(`${LOG} merge failed`, {
          targetId,
          sourceId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  console.info(`${LOG} consolidate complete`, { userId, merges });
  return { merges };
}

/**
 * Full rebuild: reset collection + people assignments, then identity-group all faces.
 */
export async function reprocessFacesWithRekognitionIdentity(
  userId: string,
): Promise<GroupFacesResult> {
  const all = await listAllFacesForUser(userId, 5000);
  console.info(`${LOG} full identity reprocess`, {
    userId,
    faces: all.length,
  });

  for (const face of all) {
    if (face.personId) {
      await unassignFaceFromPerson(face.id, userId);
    }
  }

  const peopleRows = await listPeopleForUser(userId);
  const db = getDb();
  for (const person of peopleRows) {
    const remaining = await listFacesForPerson(person.id, userId);
    if (remaining.length === 0) {
      await db
        .delete(people)
        .where(and(eq(people.id, person.id), eq(people.userId, userId)));
    }
  }

  await resetFaceCollection(userId);

  const result = await groupFacesWithRekognitionIdentity(
    userId,
    all.map((f) => f.id),
  );

  await consolidatePeopleWithRekognitionIdentity(userId);

  return result;
}

export function shouldUseRekognitionIdentity(): boolean {
  if (process.env.FACE_IDENTITY_MATCHING === "false") return false;
  if (process.env.FACE_DETECTION_ENABLED !== "true") return false;
  const provider = (
    process.env.FACE_DETECTION_PROVIDER ?? "rekognition"
  ).toLowerCase();
  return provider === "rekognition";
}

/**
 * Split faces incorrectly assigned to the same person on one photo,
 * then re-run identity grouping on the freed faces.
 */
export async function repairSameMediaPersonCollisions(
  userId: string,
): Promise<{ freed: number; grouping: GroupFacesResult | null }> {
  const all = await listAllFacesForUser(userId, 5000);
  const byMediaPerson = new Map<string, typeof all>();

  for (const face of all) {
    if (!face.personId) continue;
    const key = `${face.mediaId}::${face.personId}`;
    const list = byMediaPerson.get(key) ?? [];
    list.push(face);
    byMediaPerson.set(key, list);
  }

  const toRegroup: string[] = [];
  for (const [, group] of byMediaPerson) {
    if (group.length < 2) continue;
    // Keep the earliest face on this person+media; free the rest.
    const sorted = [...group].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
    for (const extra of sorted.slice(1)) {
      await unassignFaceFromPerson(extra.id, userId);
      toRegroup.push(extra.id);
      console.info(`${LOG} freed same-media collision face`, {
        faceId: extra.id,
        mediaId: extra.mediaId,
        wasPersonId: sorted[0]?.personId,
      });
    }
  }

  if (toRegroup.length === 0) {
    return { freed: 0, grouping: null };
  }

  const grouping = await groupFacesWithRekognitionIdentity(userId, toRegroup);
  return { freed: toRegroup.length, grouping };
}
