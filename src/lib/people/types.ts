/**
 * Shared types for face detection / person grouping.
 * Kept separate from the Drizzle schema so helpers can import without cycles.
 */

/** Bounding box relative to the source image (normalized 0–1). */
export type FaceBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Optional vendor / model embedding vector for clustering. */
export type FaceEmbedding = number[];
