/**
 * Google Cloud Vision FACE_DETECTION (REST).
 *
 * Uses images:annotate. Bounding boxes from Vision are absolute pixels;
 * we normalize using media width/height when provided.
 * Vision does not return face embeddings on this endpoint.
 */

import {
  FaceDetectionError,
  normalizeBox,
  type DetectedFace,
  type FaceDetectionImageInput,
  type FaceDetectionProvider,
  type FaceDetectionProviderResult,
} from "@/lib/faces/providers/types";

const LOG = "[faces.google_vision]";

export function isGoogleVisionFaceDetectionConfigured(): boolean {
  return Boolean(process.env.GOOGLE_VISION_API_KEY?.trim());
}

function verticesToBox(
  vertices: Array<{ x?: number; y?: number }> | undefined,
  width: number,
  height: number,
): DetectedFace["boundingBox"] | null {
  if (!vertices?.length || width <= 0 || height <= 0) return null;
  const xs = vertices.map((v) => v.x ?? 0);
  const ys = vertices.map((v) => v.y ?? 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return normalizeBox({
    x: minX / width,
    y: minY / height,
    width: (maxX - minX) / width,
    height: (maxY - minY) / height,
  });
}

export const googleVisionFaceDetectionProvider: FaceDetectionProvider = {
  name: "google_vision",

  async detectFaces(
    input: FaceDetectionImageInput,
  ): Promise<FaceDetectionProviderResult> {
    const apiKey = process.env.GOOGLE_VISION_API_KEY?.trim();
    if (!apiKey) {
      throw new FaceDetectionError(
        "google_vision",
        "GOOGLE_VISION_API_KEY is not set.",
      );
    }

    const width = input.width ?? 0;
    const height = input.height ?? 0;
    if (width <= 0 || height <= 0) {
      throw new FaceDetectionError(
        "google_vision",
        "Google Vision face boxes need media width/height to normalize.",
      );
    }

    const baseUrl =
      process.env.GOOGLE_VISION_API_URL?.trim() ||
      "https://vision.googleapis.com/v1/images:annotate";

    console.info(`${LOG} FACE_DETECTION starting`, {
      bytes: input.buffer.byteLength,
      width,
      height,
    });

    try {
      const response = await fetch(`${baseUrl}?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: input.buffer.toString("base64") },
              features: [{ type: "FACE_DETECTION", maxResults: 50 }],
            },
          ],
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new FaceDetectionError(
          "google_vision",
          `Vision API HTTP ${response.status}: ${text.slice(0, 200)}`,
        );
      }

      const json = (await response.json()) as {
        responses?: Array<{
          faceAnnotations?: Array<{
            detectionConfidence?: number;
            boundingPoly?: { vertices?: Array<{ x?: number; y?: number }> };
            fdBoundingPoly?: { vertices?: Array<{ x?: number; y?: number }> };
          }>;
          error?: { message?: string };
        }>;
      };

      const first = json.responses?.[0];
      if (first?.error?.message) {
        throw new FaceDetectionError("google_vision", first.error.message);
      }

      const detected: DetectedFace[] = [];
      for (const ann of first?.faceAnnotations ?? []) {
        const box = verticesToBox(
          ann.fdBoundingPoly?.vertices ?? ann.boundingPoly?.vertices,
          width,
          height,
        );
        if (!box) continue;
        detected.push({
          boundingBox: box,
          confidence:
            typeof ann.detectionConfidence === "number"
              ? ann.detectionConfidence
              : null,
          faceToken: null,
          embedding: null,
          raw: {
            detectionConfidence: ann.detectionConfidence ?? null,
          },
        });
      }

      console.info(`${LOG} FACE_DETECTION complete`, {
        faceCount: detected.length,
      });

      return {
        faces: detected,
        provider: "face.detection.google_vision",
        mock: false,
      };
    } catch (error) {
      if (error instanceof FaceDetectionError) throw error;
      console.error(`${LOG} failed`, { error });
      throw new FaceDetectionError(
        "google_vision",
        error instanceof Error ? error.message : "Google Vision failed.",
        error,
      );
    }
  },
};
