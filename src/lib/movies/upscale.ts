/**
 * Pre-framing upscale for small/low-res movie stills.
 *
 * Detects when an oriented source cannot fill the export canvas at 1:1
 * (coverScale < useful threshold), then enlarges before Ken Burns sampling.
 *
 * Baseline: sharp lanczos3 (+ light sharpen). Optional Real-ESRGAN binary via
 * MOVIE_REALESRGAN_BIN — never required; failures fall back to sharp, then to
 * the original buffer so one bad upscale cannot fail the movie.
 *
 * Cache: content-hash keyed JPEG under processed/movie-upscale/ (R2) and a
 * local tmp mirror for same-worker re-renders.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { sourceCoverScale } from "@/lib/movies/framing";
import { maybeUpscaleMovieSource } from "@/lib/movies/upscale";
import { getObjectBytes, putObjectBytes, R2_PREFIXES } from "@/lib/r2";

/** Bump when upscale algorithm / target policy changes (invalidates cache). */
export const MOVIE_UPSCALE_CACHE_VERSION = "v2";

/**
 * Minimum coverScale (source cover window / output) before we consider the
 * still "useful" for 1080p framed output. 1.0 = fill without enlargement;
 * slight headroom helps mild Ken Burns without immediate soft zoom.
 */
export const MOVIE_UPSCALE_MIN_COVER_SCALE = 1.12;

/** Soft ceiling so thumbnail→giant doesn't explode RAM. */
export const MOVIE_UPSCALE_MAX_LONG_EDGE = 4096;

export type MovieUpscalePlan = {
  needed: boolean;
  coverScale: number;
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
  scaleFactor: number;
};

export type MovieUpscaleResult = {
  buffer: Buffer;
  width: number;
  height: number;
  applied: boolean;
  method: "none" | "cache" | "sharp" | "realesrgan";
  fromCache: boolean;
};

/**
 * Decide whether / how far to upscale for the export canvas.
 */
export function planMovieSourceUpscale(input: {
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  /** Override min cover scale (tests / fast path). */
  minCoverScale?: number;
  maxLongEdge?: number;
}): MovieUpscalePlan {
  const sw = Math.max(1, input.sourceWidth);
  const sh = Math.max(1, input.sourceHeight);
  const ow = Math.max(1, input.outputWidth);
  const oh = Math.max(1, input.outputHeight);
  const minCover = input.minCoverScale ?? MOVIE_UPSCALE_MIN_COVER_SCALE;
  const maxLong = input.maxLongEdge ?? MOVIE_UPSCALE_MAX_LONG_EDGE;

  const coverScale = sourceCoverScale(sw, sh, ow, oh);
  if (coverScale >= minCover) {
    return {
      needed: false,
      coverScale,
      sourceWidth: sw,
      sourceHeight: sh,
      targetWidth: sw,
      targetHeight: sh,
      scaleFactor: 1,
    };
  }

  const rawFactor = minCover / Math.max(1e-6, coverScale);
  // Cap so tiny thumbs don't become 8K monsters on 1GB workers.
  const longEdge = Math.max(sw, sh);
  const maxFactor = maxLong / longEdge;
  const scaleFactor = Math.min(rawFactor, maxFactor);
  // Skip trivial enlargements (noise only).
  if (scaleFactor < 1.05) {
    return {
      needed: false,
      coverScale,
      sourceWidth: sw,
      sourceHeight: sh,
      targetWidth: sw,
      targetHeight: sh,
      scaleFactor: 1,
    };
  }

  const targetWidth = Math.max(1, Math.round(sw * scaleFactor));
  const targetHeight = Math.max(1, Math.round(sh * scaleFactor));

  return {
    needed: true,
    coverScale,
    sourceWidth: sw,
    sourceHeight: sh,
    targetWidth,
    targetHeight,
    scaleFactor,
  };
}

export function buildMovieUpscaleCacheKey(fingerprint: string): string {
  const safe = fingerprint.replace(/[^a-f0-9]/gi, "").slice(0, 64);
  return `${R2_PREFIXES.processed}movie-upscale/${MOVIE_UPSCALE_CACHE_VERSION}-${safe}.jpg`;
}

export function fingerprintMovieUpscaleSource(input: {
  buffer: Buffer;
  targetWidth: number;
  targetHeight: number;
}): string {
  return createHash("sha256")
    .update(MOVIE_UPSCALE_CACHE_VERSION)
    .update(`:${input.targetWidth}x${input.targetHeight}:`)
    .update(input.buffer)
    .digest("hex")
    .slice(0, 40);
}

function localUpscaleCachePath(fingerprint: string): string {
  return join(
    tmpdir(),
    "fmv-movie-upscale",
    MOVIE_UPSCALE_CACHE_VERSION,
    `${fingerprint}.jpg`,
  );
}

async function readLocalUpscaleCache(
  fingerprint: string,
): Promise<Buffer | null> {
  try {
    return await readFile(localUpscaleCachePath(fingerprint));
  } catch {
    return null;
  }
}

async function writeLocalUpscaleCache(
  fingerprint: string,
  jpeg: Buffer,
): Promise<void> {
  const path = localUpscaleCachePath(fingerprint);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, jpeg);
}

async function readR2UpscaleCache(fingerprint: string): Promise<Buffer | null> {
  try {
    const key = buildMovieUpscaleCacheKey(fingerprint);
    const { body } = await getObjectBytes(key);
    if (!body || body.byteLength < 64) return null;
    return Buffer.from(body);
  } catch {
    return null;
  }
}

async function writeR2UpscaleCache(
  fingerprint: string,
  jpeg: Buffer,
): Promise<void> {
  try {
    await putObjectBytes(buildMovieUpscaleCacheKey(fingerprint), jpeg, {
      contentType: "image/jpeg",
      cacheControl: "private, max-age=31536000",
    });
  } catch (err) {
    console.warn("[movies.upscale] R2 cache write failed", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Sharp lanczos enlarge to exact target size (high-quality baseline).
 */
export async function upscaleWithSharp(
  buffer: Buffer,
  targetWidth: number,
  targetHeight: number,
): Promise<Buffer> {
  return sharp(buffer)
    .resize(targetWidth, targetHeight, {
      fit: "fill",
      kernel: "lanczos3",
      withoutEnlargement: false,
    })
    // Mild recover of edge presence after enlarge — keep subtle.
    .sharpen({ sigma: 0.55, m1: 0.5, m2: 2.5 })
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toBuffer();
}

function resolveRealesrganBin(): string | null {
  const fromEnv = process.env.MOVIE_REALESRGAN_BIN?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return null;
}

/**
 * Optional Real-ESRGAN CLI. Disabled unless MOVIE_REALESRGAN_BIN is set and
 * points at an executable — keeps Railway workers stable by default.
 */
export async function upscaleWithRealesrganIfAvailable(
  buffer: Buffer,
  targetWidth: number,
  targetHeight: number,
): Promise<Buffer | null> {
  const bin = resolveRealesrganBin();
  if (!bin) return null;

  const work = join(
    tmpdir(),
    `fmv-realesrgan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const inputPath = join(work, "in.jpg");
  const outputPath = join(work, "out.jpg");

  try {
    await mkdir(work, { recursive: true });
    await writeFile(inputPath, buffer);

    const srcMeta = await sharp(buffer).metadata();
    const srcLong = Math.max(srcMeta.width ?? 1, srcMeta.height ?? 1);
    const tgtLong = Math.max(targetWidth, targetHeight);
    // realesrgan-ncnn-vulkan typically supports 2/3/4.
    const scale = Math.min(4, Math.max(2, Math.ceil(tgtLong / srcLong)));

    await runCommand(
      bin,
      [
        "-i",
        inputPath,
        "-o",
        outputPath,
        "-n",
        "realesrgan-x4plus",
        "-s",
        String(scale),
      ],
      90_000,
    );

    let out = await readFile(outputPath);
    const meta = await sharp(out).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w < targetWidth || h < targetHeight) {
      // ESRGAN under-shot — finish with sharp to exact target.
      out = await upscaleWithSharp(out, targetWidth, targetHeight);
    } else if (w !== targetWidth || h !== targetHeight) {
      out = await sharp(out)
        .resize(targetWidth, targetHeight, {
          fit: "inside",
          withoutEnlargement: false,
          kernel: "lanczos3",
        })
        .jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true })
        .toBuffer();
    }
    return out;
  } catch (err) {
    console.warn("[movies.upscale] Real-ESRGAN failed — will use sharp", {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    try {
      const { rm } = await import("node:fs/promises");
      await rm(work, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`exit ${code}: ${stderr.slice(0, 400)}`));
    });
  });
}

/**
 * Upscale when needed. Never throws for upscale failures — returns the
 * original buffer so the movie render can continue.
 */
export async function maybeUpscaleMovieSource(input: {
  oriented: Buffer;
  sourceWidth: number;
  sourceHeight: number;
  outputWidth: number;
  outputHeight: number;
  /** Skip R2/network cache (unit tests). */
  skipRemoteCache?: boolean;
  mediaId?: string;
}): Promise<MovieUpscaleResult> {
  const plan = planMovieSourceUpscale({
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    outputWidth: input.outputWidth,
    outputHeight: input.outputHeight,
  });

  if (!plan.needed) {
    return {
      buffer: input.oriented,
      width: input.sourceWidth,
      height: input.sourceHeight,
      applied: false,
      method: "none",
      fromCache: false,
    };
  }

  const fingerprint = fingerprintMovieUpscaleSource({
    buffer: input.oriented,
    targetWidth: plan.targetWidth,
    targetHeight: plan.targetHeight,
  });

  try {
    const local = await readLocalUpscaleCache(fingerprint);
    if (local) {
      const meta = await sharp(local).metadata();
      return {
        buffer: local,
        width: meta.width ?? plan.targetWidth,
        height: meta.height ?? plan.targetHeight,
        applied: true,
        method: "cache",
        fromCache: true,
      };
    }

    if (!input.skipRemoteCache) {
      const remote = await readR2UpscaleCache(fingerprint);
      if (remote) {
        await writeLocalUpscaleCache(fingerprint, remote).catch(() => undefined);
        const meta = await sharp(remote).metadata();
        return {
          buffer: remote,
          width: meta.width ?? plan.targetWidth,
          height: meta.height ?? plan.targetHeight,
          applied: true,
          method: "cache",
          fromCache: true,
        };
      }
    }

    let jpeg: Buffer | null = null;
    let method: "sharp" | "realesrgan" = "sharp";

    const esrgan = await upscaleWithRealesrganIfAvailable(
      input.oriented,
      plan.targetWidth,
      plan.targetHeight,
    );
    if (esrgan) {
      jpeg = esrgan;
      method = "realesrgan";
    } else {
      jpeg = await upscaleWithSharp(
        input.oriented,
        plan.targetWidth,
        plan.targetHeight,
      );
    }

    const meta = await sharp(jpeg).metadata();
    const width = meta.width ?? plan.targetWidth;
    const height = meta.height ?? plan.targetHeight;

    await writeLocalUpscaleCache(fingerprint, jpeg).catch(() => undefined);
    if (!input.skipRemoteCache) {
      void writeR2UpscaleCache(fingerprint, jpeg);
    }

    console.info("[movies.upscale] Enlarged small still before Ken Burns", {
      mediaId: input.mediaId,
      from: `${plan.sourceWidth}x${plan.sourceHeight}`,
      to: `${width}x${height}`,
      coverScale: Number(plan.coverScale.toFixed(3)),
      scaleFactor: Number(plan.scaleFactor.toFixed(3)),
      method,
    });

    return {
      buffer: jpeg,
      width,
      height,
      applied: true,
      method,
      fromCache: false,
    };
  } catch (err) {
    console.warn("[movies.upscale] Upscale failed — using original still", {
      mediaId: input.mediaId,
      err: err instanceof Error ? err.message : String(err),
      sourceWidth: input.sourceWidth,
      sourceHeight: input.sourceHeight,
    });
    return {
      buffer: input.oriented,
      width: input.sourceWidth,
      height: input.sourceHeight,
      applied: false,
      method: "none",
      fromCache: false,
    };
  }
}
