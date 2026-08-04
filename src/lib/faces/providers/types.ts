/**
 * Pluggable face detection provider contract.
 * Swap providers via FACE_DETECTION_PROVIDER without changing callers.
 */

import type { FaceBoundingBox, FaceEmbedding } from "@/lib/people/types";

export const FACE_DETECTION_PROVIDERS = [
  "rekognition",
  "google_vision",
  "mock",
] as const;

export type FaceDetectionProviderName =
  (typeof FACE_DETECTION_PROVIDERS)[number];

export type FaceDetectionImageInput = {
  buffer: Buffer;
  contentType?: string;
  /** Source image pixel size — used to normalize absolute boxes (Google). */
  width?: number | null;
  height?: number | null;
  key?: string;
};

/** One face returned by a detector (not yet persisted). */
export type DetectedFace = {
  boundingBox: FaceBoundingBox;
  /** Detector confidence in [0, 1] when available. */
  confidence: number | null;
  /** Vendor face id / token when the API provides one. */
  faceToken: string | null;
  /** Embedding vector when the provider supplies one (often null). */
  embedding: FaceEmbedding | null;
  /** Sanitized vendor fields for audit (never image bytes). */
  raw?: Record<string, unknown>;
};

export type FaceDetectionProviderResult = {
  faces: DetectedFace[];
  provider: string;
  mock: boolean;
  notes?: string;
};

export interface FaceDetectionProvider {
  readonly name: string;
  detectFaces(
    input: FaceDetectionImageInput,
  ): Promise<FaceDetectionProviderResult>;
}

export class FaceDetectionError extends Error {
  readonly step: string;
  readonly cause?: unknown;

  constructor(step: string, message: string, cause?: unknown) {
    super(`[FaceDetection:${step}] ${message}`);
    this.name = "FaceDetectionError";
    this.step = step;
    this.cause = cause;
  }
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function normalizeBox(box: FaceBoundingBox): FaceBoundingBox {
  const x = clamp01(box.x);
  const y = clamp01(box.y);
  // Keep edge faces: shrink width/height so the box stays inside [0,1].
  const width = Math.min(Math.max(0.001, box.width), Math.max(0.001, 1 - x));
  const height = Math.min(Math.max(0.001, box.height), Math.max(0.001, 1 - y));
  return { x, y, width, height };
}
