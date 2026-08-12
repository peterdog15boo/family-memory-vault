/**
 * Upload a beta feedback screenshot to R2 (server-only).
 */

import { nanoid } from "nanoid";
import { putObjectBytes, R2_PREFIXES } from "@/lib/r2";
import { isR2Configured } from "@/lib/upload/constants";
import { FEEDBACK_SCREENSHOT_MAX_BYTES } from "@/lib/feedback/screenshot-limits";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type UploadedFeedbackScreenshot = {
  key: string;
  contentType: string;
  byteSize: number;
};

function decodeDataUrl(dataUrl: string): {
  contentType: string;
  bytes: Buffer;
} {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) {
    throw new Error("Invalid screenshot data");
  }
  const contentType = match[1]!.toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) {
    throw new Error("Unsupported screenshot type");
  }
  const bytes = Buffer.from(match[2]!, "base64");
  if (bytes.byteLength === 0) {
    throw new Error("Empty screenshot");
  }
  if (bytes.byteLength > FEEDBACK_SCREENSHOT_MAX_BYTES) {
    throw new Error("Screenshot is too large");
  }
  return { contentType, bytes };
}

function extensionFor(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

/**
 * Persist screenshot under beta-feedback/{userId}/{id}.{ext}.
 * Returns null when R2 is not configured (feedback still saves without image).
 */
export async function uploadFeedbackScreenshot(input: {
  userId: string;
  dataUrl: string;
}): Promise<UploadedFeedbackScreenshot | null> {
  if (!isR2Configured()) return null;

  const { contentType, bytes } = decodeDataUrl(input.dataUrl);
  const id = nanoid();
  const key = `${R2_PREFIXES.betaFeedback}${input.userId}/${id}.${extensionFor(contentType)}`;

  const uploaded = await putObjectBytes(key, bytes, {
    contentType,
    cacheControl: "private, max-age=31536000",
  });

  return {
    key: uploaded.key,
    contentType,
    byteSize: uploaded.byteSize,
  };
}
