/**
 * AWS Rekognition DetectLabels for scene tags.
 *
 * Reuses the same credentials/region pattern as face DetectFaces.
 * Bytes payload max is 5MB — larger images are downscaled with sharp first.
 */

import {
  DetectLabelsCommand,
  RekognitionClient,
} from "@aws-sdk/client-rekognition";
import sharp from "sharp";
import type { SceneAnalysisResult, SceneLabel } from "@/lib/media/scene/types";

const LOG = "[scene.rekognition]";
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

export function isRekognitionSceneConfigured(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID?.trim() ||
      process.env.REKOGNITION_ACCESS_KEY_ID?.trim() ||
      process.env.AWS_PROFILE?.trim(),
  );
}

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

    if (out.byteLength <= MAX_IMAGE_BYTES) {
      return out;
    }

    width = Math.max(800, Math.floor(width * 0.75));
    quality = Math.max(50, quality - 10);
  }

  throw new Error(
    `Image too large for Rekognition DetectLabels after downscale (${buffer.byteLength} bytes).`,
  );
}

function normalizeTag(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildCaption(labels: SceneLabel[]): string {
  const top = labels
    .filter((l) => l.confidence >= 70)
    .slice(0, 6)
    .map((l) => l.name.toLowerCase());
  if (top.length === 0) {
    return labels
      .slice(0, 3)
      .map((l) => l.name.toLowerCase())
      .join(", ");
  }
  if (top.length === 1) return top[0]!;
  if (top.length === 2) return `${top[0]} and ${top[1]}`;
  return `${top.slice(0, -1).join(", ")}, and ${top[top.length - 1]}`;
}

/**
 * Detect scene labels from image bytes via Rekognition.
 */
export async function detectSceneLabelsWithRekognition(
  imageBytes: Buffer,
  options?: { maxLabels?: number; minConfidence?: number },
): Promise<SceneAnalysisResult> {
  const maxLabels = options?.maxLabels ?? 25;
  const minConfidence = options?.minConfidence ?? 55;
  const bytes = await prepareImageBytes(imageBytes);
  const client = createClient();

  const response = await client.send(
    new DetectLabelsCommand({
      Image: { Bytes: bytes },
      MaxLabels: maxLabels,
      MinConfidence: minConfidence,
    }),
  );

  const labels: SceneLabel[] = [];
  for (const label of response.Labels ?? []) {
    const name = label.Name?.trim();
    if (!name) continue;
    labels.push({
      name,
      confidence: label.Confidence ?? 0,
      parents: (label.Parents ?? [])
        .map((p) => p.Name?.trim())
        .filter((n): n is string => Boolean(n)),
    });
  }

  labels.sort((a, b) => b.confidence - a.confidence);

  const tags = uniqueTags(
    labels.flatMap((l) => [normalizeTag(l.name), ...(l.parents ?? []).map(normalizeTag)]),
  );

  const caption = buildCaption(labels);

  console.info(`${LOG} DetectLabels complete`, {
    labelCount: labels.length,
    tagCount: tags.length,
    caption,
  });

  return {
    caption,
    tags,
    labels,
    provider: "rekognition.detect_labels",
  };
}

function uniqueTags(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const v = value.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}
