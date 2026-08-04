/**
 * Decode mobile photo formats (especially HEIC/HEIF) to JPEG buffers for
 * moderation scanners and thumbnails. Sharp may lack HEIF; ffmpeg is fallback.
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  isHeicUploadType,
  normalizeUploadContentType,
} from "@/lib/upload/constants";

const LOG = "[media.decode-image]";

function resolveFfmpegPath(): string {
  const fromEnv =
    process.env.FFMPEG_PATH?.trim() || process.env.FFMPEG_BIN?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  try {
    const require = createRequire(import.meta.url);
    const ffmpegStatic = require("ffmpeg-static") as string | null;
    if (ffmpegStatic && existsSync(ffmpegStatic)) return ffmpegStatic;
  } catch {
    // optional
  }
  return "ffmpeg";
}

function looksLikeHeic(buffer: Buffer): boolean {
  // ISO BMFF: ftyp....heic / heif / mif1 / msf1
  if (buffer.length < 12) return false;
  if (buffer.toString("ascii", 4, 8) !== "ftyp") return false;
  const brand = buffer.toString("ascii", 8, 12).toLowerCase();
  return (
    brand.startsWith("hei") ||
    brand.startsWith("hev") ||
    brand === "mif1" ||
    brand === "msf1"
  );
}

export function needsHeicDecode(
  contentType?: string | null,
  filename?: string | null,
  buffer?: Buffer,
): boolean {
  if (isHeicUploadType(contentType)) return true;
  const normalized = normalizeUploadContentType(contentType);
  if (normalized === "image/heic" || normalized === "image/heif") return true;
  if (filename && /\.(heic|heif)$/i.test(filename)) return true;
  if (buffer && looksLikeHeic(buffer)) return true;
  return false;
}

async function ffmpegToJpeg(source: Buffer): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), "fmv-heic-"));
  const inputPath = join(workDir, "input.heic");
  const outputPath = join(workDir, "output.jpg");
  try {
    await writeFile(inputPath, source);
    const ffmpeg = resolveFfmpegPath();
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        ffmpeg,
        ["-y", "-i", inputPath, "-frames:v", "1", "-q:v", "2", outputPath],
        { stdio: ["ignore", "ignore", "pipe"] },
      );
      let stderr = "";
      child.stderr?.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else
          reject(
            new Error(
              `ffmpeg HEIC decode failed (${code}): ${stderr.slice(-500)}`,
            ),
          );
      });
    });
    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export type DecodedImageJpeg = {
  buffer: Buffer;
  contentType: string;
  converted: boolean;
};

/**
 * Ensure image bytes are JPEG for scanners / derivatives.
 * Non-HEIC images are returned as-is (contentType preserved when known).
 */
export async function ensureJpegForProcessing(
  source: Buffer,
  options?: { contentType?: string | null; filename?: string | null },
): Promise<DecodedImageJpeg> {
  if (
    !needsHeicDecode(options?.contentType, options?.filename, source) &&
    !looksLikeHeic(source)
  ) {
    return {
      buffer: source,
      contentType: options?.contentType?.trim() || "application/octet-stream",
      converted: false,
    };
  }

  try {
    const jpeg = await sharp(source)
      .rotate()
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    console.info(`${LOG} converted HEIC via sharp`, {
      bytesIn: source.byteLength,
      bytesOut: jpeg.byteLength,
    });
    return { buffer: jpeg, contentType: "image/jpeg", converted: true };
  } catch (sharpError) {
    console.warn(`${LOG} sharp HEIC decode failed — trying ffmpeg`, {
      error:
        sharpError instanceof Error ? sharpError.message : String(sharpError),
    });
  }

  const jpeg = await ffmpegToJpeg(source);
  console.info(`${LOG} converted HEIC via ffmpeg`, {
    bytesIn: source.byteLength,
    bytesOut: jpeg.byteLength,
  });
  return { buffer: jpeg, contentType: "image/jpeg", converted: true };
}
