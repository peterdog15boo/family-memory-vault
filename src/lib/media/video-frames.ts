/**
 * Sample representative JPEG frames from uploaded videos for face / scene AI.
 *
 * Cost-aware: default 5 fractions (start, 25%, 50%, 75%, near end).
 * Failures on individual timestamps are skipped; callers handle empty results.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import {
  guessVideoExtension,
  parseFfmpegDurationSec,
  resolveFfmpegPath,
  runFfmpeg,
  runFfmpegCapture,
} from "@/lib/media/ffmpeg";

const LOG = "[media.video-frames]";

/** Long edge for analysis JPEGs (faces + vision). */
export const VIDEO_FRAME_MAX_EDGE = 1280;
export const VIDEO_FRAME_JPEG_QUALITY = 82;

/**
 * Default sample points along the timeline.
 * Slightly off true 0 / 1.0 to avoid black intro/outro frames.
 */
export const DEFAULT_VIDEO_FRAME_FRACTIONS = [0.02, 0.25, 0.5, 0.75, 0.92];

export type VideoFrameSample = {
  offsetSec: number;
  fraction: number;
  buffer: Buffer;
};

export type ExtractVideoFramesResult = {
  frames: VideoFrameSample[];
  durationSec: number;
  errors: string[];
};

export function maxVideoAnalysisFrames(): number {
  const raw = Number(process.env.VIDEO_ANALYSIS_MAX_FRAMES ?? 5);
  if (!Number.isFinite(raw)) return 5;
  return Math.min(8, Math.max(1, Math.floor(raw)));
}

/**
 * Plan unique seek offsets (seconds) for a video of known duration.
 */
export function planVideoSampleOffsets(
  durationSec: number,
  options?: { maxFrames?: number; fractions?: number[] },
): { offsetSec: number; fraction: number }[] {
  const maxFrames = options?.maxFrames ?? maxVideoAnalysisFrames();
  const fractions = (
    options?.fractions ?? DEFAULT_VIDEO_FRAME_FRACTIONS
  ).slice(0, maxFrames);

  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    // Unknown length: fixed early seeks (still cost-capped).
    const fallback = [0.1, 0.5, 1.0, 2.0, 3.5].slice(0, maxFrames);
    return fallback.map((offsetSec, i) => ({
      offsetSec,
      fraction: fractions[i] ?? i / Math.max(1, maxFrames - 1),
    }));
  }

  // Keep seeks inside the file; leave a tiny tail margin.
  const end = Math.max(0.05, durationSec - 0.08);
  const planned: { offsetSec: number; fraction: number }[] = [];
  const seen = new Set<string>();

  for (const fraction of fractions) {
    const offsetSec = Math.min(end, Math.max(0, fraction * durationSec));
    const key = (Math.round(offsetSec * 20) / 20).toFixed(2); // 50ms buckets
    if (seen.has(key)) continue;
    seen.add(key);
    planned.push({ offsetSec, fraction });
  }

  // Very short clips: ensure at least one frame near the start.
  if (planned.length === 0) {
    planned.push({ offsetSec: Math.min(0.1, end), fraction: 0 });
  }

  return planned;
}

async function resizeAnalysisJpeg(source: Buffer): Promise<Buffer> {
  return sharp(source)
    .rotate()
    .resize({
      width: VIDEO_FRAME_MAX_EDGE,
      height: VIDEO_FRAME_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: VIDEO_FRAME_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

async function probeDurationSec(
  ffmpeg: string,
  inputPath: string,
): Promise<number | null> {
  try {
    const { stderr } = await runFfmpegCapture(ffmpeg, ["-i", inputPath]);
    return parseFfmpegDurationSec(stderr);
  } catch {
    return null;
  }
}

export async function extractOneFrameAtOffset(
  ffmpeg: string,
  inputPath: string,
  outputPath: string,
  offsetSec: number,
): Promise<Buffer> {
  const ss = Math.max(0, offsetSec).toFixed(3);
  const attempts: string[][] = [
    [
      "-y",
      "-ss",
      ss,
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-an",
      "-q:v",
      "3",
      outputPath,
    ],
    [
      "-y",
      "-i",
      inputPath,
      "-ss",
      ss,
      "-frames:v",
      "1",
      "-an",
      "-q:v",
      "3",
      outputPath,
    ],
  ];

  let lastError: Error | null = null;
  for (const args of attempts) {
    try {
      await runFfmpeg(ffmpeg, args);
      lastError = null;
      break;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  if (lastError) throw lastError;
  return readFile(outputPath);
}

/**
 * Extract a single JPEG frame at a known offset (for identity crops).
 */
export async function extractVideoFrameAt(
  source: Buffer,
  offsetSec: number,
  options?: {
    contentType?: string | null;
    filename?: string | null;
  },
): Promise<Buffer | null> {
  if (!source?.byteLength) return null;
  const workDir = await mkdtemp(join(tmpdir(), "fmv-vframe-"));
  const ext = guessVideoExtension(options?.contentType, options?.filename);
  const inputPath = join(workDir, `input.${ext}`);
  const outputPath = join(workDir, "frame.jpg");
  try {
    await writeFile(inputPath, source);
    const ffmpeg = resolveFfmpegPath();
    const raw = await extractOneFrameAtOffset(
      ffmpeg,
      inputPath,
      outputPath,
      offsetSec,
    );
    if (!raw.byteLength) return null;
    return resizeAnalysisJpeg(raw);
  } catch (error) {
    console.warn(`${LOG} extractVideoFrameAt failed`, {
      offsetSec,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function extractOneFrame(
  ffmpeg: string,
  inputPath: string,
  outputPath: string,
  offsetSec: number,
): Promise<Buffer> {
  return extractOneFrameAtOffset(ffmpeg, inputPath, outputPath, offsetSec);
}

/**
 * Extract a limited set of JPEG frames from a video buffer.
 * Individual frame failures are recorded in `errors` and skipped.
 */
export async function extractVideoSampleFrames(
  source: Buffer,
  options?: {
    durationMs?: number | null;
    contentType?: string | null;
    filename?: string | null;
    maxFrames?: number;
    fractions?: number[];
  },
): Promise<ExtractVideoFramesResult> {
  if (!source?.byteLength) {
    return { frames: [], durationSec: 0, errors: ["empty_video_buffer"] };
  }

  const workDir = await mkdtemp(join(tmpdir(), "fmv-vframes-"));
  const ext = guessVideoExtension(options?.contentType, options?.filename);
  const inputPath = join(workDir, `input.${ext}`);
  const errors: string[] = [];

  try {
    await writeFile(inputPath, source);
    const ffmpeg = resolveFfmpegPath();

    let durationSec =
      options?.durationMs != null && options.durationMs > 0
        ? options.durationMs / 1000
        : 0;

    if (!(durationSec > 0)) {
      const probed = await probeDurationSec(ffmpeg, inputPath);
      if (probed != null) durationSec = probed;
    }

    const plan = planVideoSampleOffsets(durationSec, {
      maxFrames: options?.maxFrames ?? maxVideoAnalysisFrames(),
      fractions: options?.fractions,
    });

    const frames: VideoFrameSample[] = [];

    for (let i = 0; i < plan.length; i++) {
      const { offsetSec, fraction } = plan[i]!;
      const outputPath = join(workDir, `frame-${i}.jpg`);
      try {
        const raw = await extractOneFrame(
          ffmpeg,
          inputPath,
          outputPath,
          offsetSec,
        );
        if (!raw.byteLength) {
          errors.push(`empty_frame@${offsetSec.toFixed(2)}s`);
          continue;
        }
        const buffer = await resizeAnalysisJpeg(raw);
        frames.push({ offsetSec, fraction, buffer });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        errors.push(`frame@${offsetSec.toFixed(2)}s: ${message.slice(0, 160)}`);
        console.warn(`${LOG} frame extract failed`, {
          offsetSec,
          error: message.slice(0, 200),
        });
      }
    }

    console.info(`${LOG} sampled`, {
      durationSec,
      planned: plan.length,
      extracted: frames.length,
      errors: errors.length,
    });

    return { frames, durationSec, errors };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
