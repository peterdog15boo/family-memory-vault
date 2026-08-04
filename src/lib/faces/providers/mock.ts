/**
 * Local mock face detector — used when FACE_DETECTION_ENABLED is off
 * or credentials are missing. Deterministic boxes for development.
 */

import type {
  FaceDetectionImageInput,
  FaceDetectionProvider,
  FaceDetectionProviderResult,
} from "@/lib/faces/providers/types";

export const mockFaceDetectionProvider: FaceDetectionProvider = {
  name: "mock",

  async detectFaces(
    _input: FaceDetectionImageInput,
  ): Promise<FaceDetectionProviderResult> {
    const faces = [
      {
        boundingBox: { x: 0.28, y: 0.18, width: 0.22, height: 0.3 },
        confidence: 0.92,
        faceToken: "mock-face-1",
        embedding: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
        raw: { mock: true, index: 0 },
      },
      {
        boundingBox: { x: 0.55, y: 0.22, width: 0.2, height: 0.28 },
        confidence: 0.88,
        faceToken: "mock-face-2",
        embedding: [0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1],
        raw: { mock: true, index: 1 },
      },
    ];

    return {
      faces,
      provider: "face.detection.mock",
      mock: true,
      notes: "MOCK: Two synthetic faces for local development.",
    };
  },
};
