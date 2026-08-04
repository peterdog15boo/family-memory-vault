/**
 * AWS Rekognition DetectFaces provider.
 *
 * BoundingBox values from Rekognition are already ratios in [0, 1]
 * (Left, Top, Width, Height). DetectFaces does not return embeddings;
 * faceToken stays null unless you later IndexFaces into a collection.
 *
 * Bytes payload max is 5MB — larger images are downscaled with sharp first.
 */

import {
  DetectFacesCommand,
  RekognitionClient,
} from "@aws-sdk/client-rekognition";
import sharp from "sharp";
import {
  FaceDetectionError,
  normalizeBox,
  type FaceDetectionImageInput,
  type FaceDetectionProvider,
  type FaceDetectionProviderResult,
  type DetectedFace,
} from "@/lib/faces/providers/types";

const LOG = "[faces.rekognition]";

/** Rekognition DetectFaces max when sending Image.Bytes. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function createClient(): RekognitionClient {
  const region =
    process.env.REKOGNITION_REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    process.env.AWS_DEFAULT_REGION?.trim() ||
    "us-east-1";

  const accessKeyId =
    process.env.REKOGNITION_ACCESS_KEY_ID?.trim() ||
    process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey =
    process.env.REKOGNITION_SECRET_ACCESS_KEY?.trim() ||
    process.env.AWS_SECRET_ACCESS_KEY?.trim();

  return new RekognitionClient({
    region,
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  });
}

export function isRekognitionFaceDetectionConfigured(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID?.trim() ||
      process.env.REKOGNITION_ACCESS_KEY_ID?.trim() ||
      process.env.AWS_PROFILE?.trim(),
  );
}

/**
 * Shrink JPEG payload under Rekognition's 5MB Bytes limit.
 * Bounding boxes stay normalized ratios, so resize does not skew them.
 */
async function prepareImageBytes(buffer: Buffer): Promise<Buffer> {
  if (buffer.byteLength <= MAX_IMAGE_BYTES) {
    return buffer;
  }

  let quality = 85;
  let width = 2400;
  let out = buffer;

  for (let attempt = 0; attempt < 6; attempt++) {
    out = await sharp(buffer)
      .rotate()
      .resize({
        width,
        height: width,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    console.info(`${LOG} downscaled for DetectFaces`, {
      originalBytes: buffer.byteLength,
      resizedBytes: out.byteLength,
      width,
      quality,
    });

    if (out.byteLength <= MAX_IMAGE_BYTES) {
      return out;
    }

    width = Math.max(800, Math.floor(width * 0.75));
    quality = Math.max(50, quality - 10);
  }

  throw new FaceDetectionError(
    "rekognition",
    `Image is too large for Rekognition DetectFaces after downscale (${out.byteLength} bytes).`,
  );
}

export const rekognitionFaceDetectionProvider: FaceDetectionProvider = {
  name: "rekognition",

  async detectFaces(
    input: FaceDetectionImageInput,
  ): Promise<FaceDetectionProviderResult> {
    const minConfidence = Number(
      process.env.FACE_DETECTION_MIN_CONFIDENCE ??
        process.env.REKOGNITION_MIN_CONFIDENCE ??
        80,
    );

    console.info(`${LOG} DetectFaces starting`, {
      bytes: input.buffer.byteLength,
      minConfidence,
    });

    try {
      const bytes = await prepareImageBytes(input.buffer);
      const client = createClient();
      const response = await client.send(
        new DetectFacesCommand({
          Image: { Bytes: bytes },
          Attributes: ["DEFAULT"],
        }),
      );

      const detected: DetectedFace[] = [];
      for (const detail of response.FaceDetails ?? []) {
        const box = detail.BoundingBox;
        if (
          box?.Left == null ||
          box.Top == null ||
          box.Width == null ||
          box.Height == null
        ) {
          continue;
        }

        const confidence =
          typeof detail.Confidence === "number"
            ? detail.Confidence / 100
            : null;

        if (
          confidence != null &&
          Number.isFinite(minConfidence) &&
          detail.Confidence! < minConfidence
        ) {
          continue;
        }

        detected.push({
          boundingBox: normalizeBox({
            x: box.Left,
            y: box.Top,
            width: box.Width,
            height: box.Height,
          }),
          confidence,
          faceToken: null,
          embedding: null,
          raw: {
            confidence: detail.Confidence ?? null,
            ageRange: detail.AgeRange ?? null,
            gender: detail.Gender?.Value ?? null,
          },
        });
      }

      console.info(`${LOG} DetectFaces complete`, {
        faceCount: detected.length,
      });

      return {
        faces: detected,
        provider: "face.detection.rekognition",
        mock: false,
        notes:
          detected.length === 0
            ? "No faces above confidence threshold."
            : undefined,
      };
    } catch (error) {
      console.error(`${LOG} DetectFaces failed`, { error });
      if (error instanceof FaceDetectionError) throw error;
      throw new FaceDetectionError(
        "rekognition",
        error instanceof Error
          ? error.message
          : "AWS Rekognition DetectFaces failed.",
        error,
      );
    }
  },
};
