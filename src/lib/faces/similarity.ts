/**
 * Similarity helpers for face grouping.
 *
 * Current approach: cosine similarity on **model** embedding vectors when present.
 * Face-token equality is an exact match.
 *
 * IMPORTANT: Do not use bounding-box geometry as a stand-in identity signal —
 * different people often share similar crop positions across photos, which caused
 * false merges with Rekognition DetectFaces (no embeddings returned).
 */

import type { Face } from "@/lib/db/schema";
import type { FaceBoundingBox, FaceEmbedding } from "@/lib/people/types";

export type FaceSimilarityScorer = (
  face: Face,
  centroid: FaceEmbedding | null,
  referenceFaces: Face[],
) => number;

/** Cosine similarity in [0, 1] (negative cosines clamped to 0). */
export function cosineSimilarity(
  a: FaceEmbedding,
  b: FaceEmbedding,
): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }

  if (normA === 0 || normB === 0) return 0;
  const cos = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  if (!Number.isFinite(cos)) return 0;
  return Math.max(0, Math.min(1, cos));
}

/** Mean vector of embeddings that share a dimension. */
export function averageEmbeddings(
  embeddings: FaceEmbedding[],
): FaceEmbedding | null {
  const usable = embeddings.filter((e) => e.length > 0);
  if (usable.length === 0) return null;

  const dim = usable[0]!.length;
  const sameDim = usable.filter((e) => e.length === dim);
  if (sameDim.length === 0) return null;

  const out = new Array<number>(dim).fill(0);
  for (const emb of sameDim) {
    for (let i = 0; i < dim; i++) {
      out[i]! += emb[i] ?? 0;
    }
  }
  for (let i = 0; i < dim; i++) {
    out[i]! /= sameDim.length;
  }
  return out;
}

/**
 * Weak geometry vector — for diagnostics / tests only.
 * Never use this for person matching (see resolveModelEmbedding).
 */
export function embeddingFromBoundingBox(box: FaceBoundingBox): FaceEmbedding {
  return [
    box.x,
    box.y,
    box.width,
    box.height,
    box.x + box.width / 2,
    box.y + box.height / 2,
    box.width * box.height,
  ];
}

/** Model embedding only — null when the detector did not provide one. */
export function resolveModelEmbedding(face: Face): FaceEmbedding | null {
  if (Array.isArray(face.embedding) && face.embedding.length > 0) {
    return face.embedding;
  }
  return null;
}

/**
 * Alias for resolveModelEmbedding (grouping / API compatibility).
 * No longer falls back to bounding-box geometry.
 */
export function resolveFaceEmbedding(face: Face): FaceEmbedding | null {
  return resolveModelEmbedding(face);
}

/**
 * Default scorer (conservative):
 * 1. Exact faceToken match against any reference face → 1
 * 2. Cosine vs person centroid using model embeddings only → [0, 1]
 * 3. Otherwise 0 → caller creates a new person
 *
 * With Rekognition DetectFaces (no embeddings / tokens), every face becomes
 * its own person until the user merges — preferable to false merges.
 */
export const defaultFaceSimilarityScorer: FaceSimilarityScorer = (
  face,
  centroid,
  referenceFaces,
) => {
  if (face.faceToken) {
    const tokenHit = referenceFaces.some(
      (ref) => ref.faceToken && ref.faceToken === face.faceToken,
    );
    if (tokenHit) return 1;
  }

  const emb = resolveModelEmbedding(face);
  if (!emb || !centroid) return 0;
  return cosineSimilarity(emb, centroid);
};

export function getDefaultMatchThreshold(): number {
  const raw = Number(process.env.FACE_GROUPING_MATCH_THRESHOLD ?? 0.72);
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return 0.72;
  return raw;
}

export function getDefaultMergeThreshold(): number {
  const raw = Number(process.env.FACE_GROUPING_MERGE_THRESHOLD ?? 0.85);
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) return 0.85;
  return raw;
}
