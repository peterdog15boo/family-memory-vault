/**
 * Server-only R2 helpers that stream objects to/from the local filesystem.
 * Kept separate from `@/lib/r2` so client bundles never see `node:` imports
 * (r2.ts is pulled into admin client components via label constants).
 */

import "server-only";

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  getR2Bucket,
  getR2Client,
  isQuarantineKey,
  isTempKey,
} from "@/lib/r2";

function assertNotQuarantineKey(key: string): void {
  if (isQuarantineKey(key)) {
    throw new Error(
      `Refusing to serve quarantined object "${key}". Quarantined media is inaccessible by design.`,
    );
  }
}

/**
 * Stream an R2 object to a local file (large videos — avoid buffering in RAM).
 */
export async function downloadObjectToFile(
  key: string,
  destPath: string,
): Promise<{ key: string; contentType?: string; contentLength?: number }> {
  if (!key?.trim()) {
    throw new Error("downloadObjectToFile requires a key.");
  }
  assertNotQuarantineKey(key);

  const { createWriteStream } = await import("node:fs");
  const { pipeline } = await import("node:stream/promises");
  const { Readable } = await import("node:stream");

  const response = await getR2Client().send(
    new GetObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
    }),
  );

  if (!response.Body) {
    throw new Error(`R2 object has empty body: ${key}`);
  }

  const nodeStream =
    typeof (response.Body as { transformToWebStream?: () => ReadableStream })
      .transformToWebStream === "function"
      ? Readable.fromWeb(
          (response.Body as { transformToWebStream: () => ReadableStream })
            .transformToWebStream() as import("node:stream/web").ReadableStream,
        )
      : (response.Body as NodeJS.ReadableStream);

  await pipeline(nodeStream, createWriteStream(destPath));

  return {
    key,
    contentType: response.ContentType,
    contentLength: response.ContentLength,
  };
}

/**
 * Upload a local file into processed/ (or other non-temp prefixes) without
 * loading the whole file into memory.
 */
export async function putObjectFromFile(
  key: string,
  filePath: string,
  options?: {
    contentType?: string;
    cacheControl?: string;
  },
): Promise<{ key: string; byteSize: number }> {
  if (!key?.trim()) {
    throw new Error("putObjectFromFile requires a key.");
  }
  assertNotQuarantineKey(key);
  if (isTempKey(key)) {
    throw new Error(
      `Refusing putObjectFromFile into temp/ ("${key}"). Use getUploadUrl for client uploads.`,
    );
  }

  const { createReadStream } = await import("node:fs");
  const { stat } = await import("node:fs/promises");
  const meta = await stat(filePath);
  if (!meta.isFile() || meta.size <= 0) {
    throw new Error(`putObjectFromFile: empty or missing file ${filePath}`);
  }

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      Body: createReadStream(filePath),
      ContentLength: meta.size,
      ContentType: options?.contentType ?? "application/octet-stream",
      CacheControl: options?.cacheControl ?? "private, max-age=31536000",
    }),
  );

  return { key, byteSize: meta.size };
}
