/**
 * Basic face → person grouping.
 *
 * Flow for newly detected (or unassigned) faces:
 * 1. Score against each existing person's embedding centroid
 * 2. If best score ≥ match threshold → assignFaceToPerson
 * 3. Otherwise createPerson + assign
 *
 * Similarity is intentionally conservative (cosine on model embeddings /
 * face-token match only). Without embeddings, each face becomes its own
 * person until the user merges — avoids false merges from bbox geometry.
 *
 * Also exposes merge suggestions and a full re-process entry point.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { faces, people, type Face, type Person } from "@/lib/db/schema";
import {
  averageEmbeddings,
  cosineSimilarity,
  defaultFaceSimilarityScorer,
  getDefaultMatchThreshold,
  getDefaultMergeThreshold,
  resolveModelEmbedding,
  type FaceSimilarityScorer,
} from "@/lib/faces/similarity";
import {
  assignFaceToPerson,
  createPerson,
  listAllFacesForUser,
  listFacesForPerson,
  listPeopleForUser,
  listUnassignedFaces,
  mergePeople,
  unassignFaceFromPerson,
} from "@/lib/people";
import { listVisibleFacesLinkedToPerson } from "@/lib/people/person-media";

const LOG = "[faces.grouping]";

export type GroupFaceDecision =
  | {
      action: "assigned";
      faceId: string;
      personId: string;
      personName: string;
      score: number;
    }
  | {
      action: "created";
      faceId: string;
      personId: string;
      personName: string;
      score: number;
    }
  | {
      action: "skipped";
      faceId: string;
      reason: string;
    };

export type GroupFacesResult = {
  userId: string;
  decisions: GroupFaceDecision[];
  assigned: number;
  created: number;
  skipped: number;
};

export type PersonMergeSuggestion = {
  keepPersonId: string;
  keepPersonName: string;
  mergePersonId: string;
  mergePersonName: string;
  score: number;
  keepFaceCount: number;
  mergeFaceCount: number;
};

export type SuggestMergesResult = {
  userId: string;
  threshold: number;
  suggestions: PersonMergeSuggestion[];
};

export type ReprocessGroupingOptions = {
  /** Clear existing assignments before regrouping (default false). */
  resetAssignments?: boolean;
  /** After reset, delete people who no longer have faces (default true when reset). */
  pruneEmptyPeople?: boolean;
  matchThreshold?: number;
  scorer?: FaceSimilarityScorer;
  /** Auto-apply merge suggestions above mergeThreshold (default false). */
  applyMerges?: boolean;
  mergeThreshold?: number;
};

export type ReprocessGroupingResult = {
  grouping: GroupFacesResult;
  merges: SuggestMergesResult;
  appliedMerges: Array<{
    keepPersonId: string;
    mergePersonId: string;
    score: number;
  }>;
};

type PersonCluster = {
  person: Person;
  faces: Face[];
  centroid: ReturnType<typeof averageEmbeddings>;
};

async function loadPersonClusters(userId: string): Promise<PersonCluster[]> {
  const people = await listPeopleForUser(userId);
  const clusters: PersonCluster[] = [];

  for (const person of people) {
    const personFaces = await listVisibleFacesLinkedToPerson(userId, person.id);
    const embeddings = personFaces
      .map((f) => resolveModelEmbedding(f))
      .filter((e): e is NonNullable<typeof e> => Boolean(e));
    clusters.push({
      person,
      faces: personFaces,
      centroid: averageEmbeddings(embeddings),
    });
  }

  return clusters;
}

function nextPersonLabel(existingCount: number): string {
  return `Person ${existingCount + 1}`;
}

/**
 * Group specific face ids for a user (must be owned by userId).
 * Faces already assigned are skipped unless you unassign first.
 */
export async function groupFaces(
  userId: string,
  faceIds: string[],
  options?: {
    matchThreshold?: number;
    scorer?: FaceSimilarityScorer;
  },
): Promise<GroupFacesResult> {
  const uniqueIds = [...new Set(faceIds.filter(Boolean))];
  const threshold = options?.matchThreshold ?? getDefaultMatchThreshold();
  const scorer = options?.scorer ?? defaultFaceSimilarityScorer;

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
  const clusters = await loadPersonClusters(userId);

  console.info(`${LOG} grouping faces`, {
    userId,
    requested: uniqueIds.length,
    loaded: rows.length,
    people: clusters.length,
    threshold,
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

    let best: { cluster: PersonCluster; score: number } | null = null;
    for (const cluster of clusters) {
      const score = scorer(face, cluster.centroid, cluster.faces);
      if (!best || score > best.score) {
        best = { cluster, score };
      }
    }

    if (best && best.score >= threshold) {
      await assignFaceToPerson(face.id, best.cluster.person.id, userId);
      // Keep in-memory cluster fresh for subsequent faces in this batch.
      best.cluster.faces.push({ ...face, personId: best.cluster.person.id });
      const emb = resolveModelEmbedding(face);
      if (emb) {
        const embeddings = best.cluster.faces
          .map((f) => resolveModelEmbedding(f))
          .filter((e): e is NonNullable<typeof e> => Boolean(e));
        best.cluster.centroid = averageEmbeddings(embeddings);
      }

      decisions.push({
        action: "assigned",
        faceId: face.id,
        personId: best.cluster.person.id,
        personName: best.cluster.person.name,
        score: best.score,
      });
      assigned += 1;
      continue;
    }

    const personName = nextPersonLabel(clusters.length);
    let person;
    try {
      person = await createPerson({ userId, name: personName });
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
    await assignFaceToPerson(face.id, person.id, userId);

    const assignedFace = { ...face, personId: person.id };
    const modelEmb = resolveModelEmbedding(assignedFace);
    clusters.push({
      person,
      faces: [assignedFace],
      centroid: modelEmb ? averageEmbeddings([modelEmb]) : null,
    });

    decisions.push({
      action: "created",
      faceId: face.id,
      personId: person.id,
      personName: person.name,
      score: best?.score ?? 0,
    });
    created += 1;
  }

  console.info(`${LOG} grouping complete`, {
    userId,
    assigned,
    created,
    skipped,
  });

  return { userId, decisions, assigned, created, skipped };
}

/**
 * Group all currently unassigned faces for a user.
 */
export async function groupUnassignedFaces(
  userId: string,
  options?: {
    matchThreshold?: number;
    scorer?: FaceSimilarityScorer;
    limit?: number;
  },
): Promise<GroupFacesResult> {
  const unassigned = await listUnassignedFaces(userId, options?.limit ?? 500);
  return groupFaces(
    userId,
    unassigned.map((f) => f.id),
    options,
  );
}

/**
 * Suggest merges between people whose centroids are highly similar.
 * Does not mutate data — use applyPersonMerge / reprocessFaceGrouping to apply.
 */
export async function suggestPersonMerges(
  userId: string,
  options?: {
    mergeThreshold?: number;
    scorer?: FaceSimilarityScorer;
  },
): Promise<SuggestMergesResult> {
  const threshold = options?.mergeThreshold ?? getDefaultMergeThreshold();
  const scorer = options?.scorer ?? defaultFaceSimilarityScorer;
  const clusters = await loadPersonClusters(userId);
  const suggestions: PersonMergeSuggestion[] = [];

  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const a = clusters[i]!;
      const b = clusters[j]!;

      // Score a representative face from A against B's centroid and vice versa.
      const scoreAB =
        a.faces[0] && b.centroid
          ? scorer(a.faces[0], b.centroid, b.faces)
          : 0;
      const scoreBA =
        b.faces[0] && a.centroid
          ? scorer(b.faces[0], a.centroid, a.faces)
          : 0;
      const score =
        a.centroid && b.centroid
          ? Math.max(
              scoreAB,
              scoreBA,
              cosineSimilarity(a.centroid, b.centroid),
            )
          : Math.max(scoreAB, scoreBA);

      if (score < threshold) continue;

      // Keep the person with more faces (stable identity).
      const keep = a.faces.length >= b.faces.length ? a : b;
      const merge = keep === a ? b : a;

      suggestions.push({
        keepPersonId: keep.person.id,
        keepPersonName: keep.person.name,
        mergePersonId: merge.person.id,
        mergePersonName: merge.person.name,
        score,
        keepFaceCount: keep.faces.length,
        mergeFaceCount: merge.faces.length,
      });
    }
  }

  suggestions.sort((x, y) => y.score - x.score);

  console.info(`${LOG} merge suggestions`, {
    userId,
    threshold,
    count: suggestions.length,
  });

  return { userId, threshold, suggestions };
}

/** Apply a single suggested merge (owner-scoped). */
export async function applyPersonMerge(
  userId: string,
  keepPersonId: string,
  mergePersonId: string,
): Promise<Person> {
  return mergePeople(keepPersonId, mergePersonId, userId);
}

/**
 * Re-process grouping for a user:
 * - optionally reset assignments
 * - group unassigned (or all, after reset)
 * - suggest merges; optionally apply them
 */
export async function reprocessFaceGrouping(
  userId: string,
  options: ReprocessGroupingOptions = {},
): Promise<ReprocessGroupingResult> {
  if (options.resetAssignments) {
    const all = await listAllFacesForUser(userId);
    console.info(`${LOG} resetting assignments`, {
      userId,
      faces: all.length,
    });
    for (const face of all) {
      if (face.personId) {
        await unassignFaceFromPerson(face.id, userId);
      }
    }

    const shouldPrune = options.pruneEmptyPeople !== false;
    if (shouldPrune) {
      const peopleRows = await listPeopleForUser(userId);
      const db = getDb();
      let pruned = 0;
      for (const person of peopleRows) {
        // After unassign, faceCount may still be stale if SQL counted unclean —
        // delete any person with zero assigned faces.
        const remaining = await listFacesForPerson(person.id, userId);
        if (remaining.length === 0) {
          await db
            .delete(people)
            .where(and(eq(people.id, person.id), eq(people.userId, userId)));
          pruned += 1;
        }
      }
      console.info(`${LOG} pruned empty people`, { userId, pruned });
    }
  }

  const grouping = await groupUnassignedFaces(userId, {
    matchThreshold: options.matchThreshold,
    scorer: options.scorer,
  });

  const merges = await suggestPersonMerges(userId, {
    mergeThreshold: options.mergeThreshold,
    scorer: options.scorer,
  });

  const appliedMerges: ReprocessGroupingResult["appliedMerges"] = [];
  if (options.applyMerges) {
    // Apply greedily from highest score; skip if either id already merged away.
    const removed = new Set<string>();
    for (const suggestion of merges.suggestions) {
      if (
        removed.has(suggestion.keepPersonId) ||
        removed.has(suggestion.mergePersonId)
      ) {
        continue;
      }
      await applyPersonMerge(
        userId,
        suggestion.keepPersonId,
        suggestion.mergePersonId,
      );
      removed.add(suggestion.mergePersonId);
      appliedMerges.push({
        keepPersonId: suggestion.keepPersonId,
        mergePersonId: suggestion.mergePersonId,
        score: suggestion.score,
      });
    }
  }

  return { grouping, merges, appliedMerges };
}
