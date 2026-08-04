/**
 * Shared ffmpeg helpers (poster + video frame sampling).
 */

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

export function resolveFfmpegPath(): string {
  const fromEnv =
    process.env.FFMPEG_PATH?.trim() || process.env.FFMPEG_BIN?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  try {
    const require = createRequire(import.meta.url);
    const ffmpegStatic = require("ffmpeg-static") as string | null;
    if (ffmpegStatic && existsSync(ffmpegStatic)) return ffmpegStatic;
  } catch {
    // optional binary
  }
  return "ffmpeg";
}

export function guessVideoExtension(
  contentType?: string | null,
  filename?: string | null,
): string {
  const name = filename?.toLowerCase() ?? "";
  if (name.endsWith(".mov") || contentType === "video/quicktime") return "mov";
  if (name.endsWith(".webm") || contentType === "video/webm") return "webm";
  if (name.endsWith(".m4v")) return "m4v";
  if (name.endsWith(".mp4") || contentType === "video/mp4") return "mp4";
  return "mp4";
}

export function runFfmpeg(ffmpeg: string, args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpeg, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`ffmpeg failed (${code}): ${stderr.slice(-500)}`),
        );
    });
  });
}

/** Capture ffmpeg stderr (used for duration probing). */
export function runFfmpegCapture(
  ffmpeg: string,
  args: string[],
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stderr });
    });
  });
}

/** Parse `Duration: HH:MM:SS.xx` from ffmpeg -i stderr. */
export function parseFfmpegDurationSec(stderr: string): number | null {
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i.exec(stderr);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (![hours, minutes, seconds].every((n) => Number.isFinite(n))) return null;
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}
