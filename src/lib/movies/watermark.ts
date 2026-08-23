/**
 * Free-plan movie brand watermark — burned into the final MP4.
 *
 * Uses sharp's text renderer (not SVG system fonts) so Linux workers still
 * produce readable “Created with Family Memory Vault” overlays.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import type { PlanFeatures } from "@/lib/db/schema";

export const MOVIE_WATERMARK_LABEL = "Created with Family Memory Vault";

/**
 * Free plan always shows the soft brand mark.
 * Paid catalogs set `removeMovieWatermark: true` (and known paid slugs
 * default off even if an older DB features blob omits the flag).
 */
export function shouldApplyMovieWatermark(
  planSlug: string | null | undefined,
  features: PlanFeatures | null | undefined,
): boolean {
  const slug = String(planSlug ?? "");
  if (slug === "free") return true;
  const removeFlag = features?.removeMovieWatermark;
  if (removeFlag === true) return false;
  if (slug === "family" || slug === "family_plus" || slug === "legacy") {
    return false;
  }
  // Unknown / custom plans: watermark unless explicitly removed.
  return !removeFlag;
}

export type BrandWatermarkOverlay = {
  path: string;
  width: number;
  height: number;
  /** Bottom margin in output pixels. */
  margin: number;
  hasLogo: boolean;
};

/**
 * Build a bottom-safe overlay PNG: soft pill + optional logo + label.
 * Sized for the export canvas so it stays small and professional.
 */
export async function buildBrandWatermarkOverlay(input: {
  workDir: string;
  width: number;
  height: number;
}): Promise<BrandWatermarkOverlay> {
  const { workDir, width, height } = input;
  const margin = Math.max(14, Math.round(height * 0.028));
  const fontPx = Math.max(15, Math.round(height * 0.024));
  const logoMaxH = Math.max(18, Math.round(height * 0.038));
  const padX = Math.max(12, Math.round(width * 0.012));
  const padY = Math.max(8, Math.round(height * 0.01));
  const gap = Math.max(8, Math.round(padX * 0.55));

  const logoCandidates = [
    join(process.cwd(), "public", "brand", "logo.png"),
    join(process.cwd(), "public", "brand", "logo-light.jpg"),
  ];
  const logoSrc = logoCandidates.find((p) => existsSync(p)) ?? null;

  let logoW = 0;
  let logoH = 0;
  let logoBuf: Buffer | null = null;
  if (logoSrc) {
    try {
      const meta = await sharp(logoSrc).metadata();
      const srcH = Math.max(1, meta.height || 64);
      const srcW = Math.max(1, meta.width || 64);
      logoH = logoMaxH;
      logoW = Math.max(1, Math.round((srcW / srcH) * logoH));
      // Soften / lift the mark so it reads on both light and dark footage.
      logoBuf = await sharp(logoSrc)
        .resize(logoW, logoH, { fit: "inside", kernel: "lanczos3" })
        .ensureAlpha()
        .modulate({ brightness: 1.45, saturation: 0.85 })
        .linear(1.05, 18)
        .png()
        .toBuffer();
      const sized = await sharp(logoBuf).metadata();
      logoW = sized.width ?? logoW;
      logoH = sized.height ?? logoH;
    } catch {
      logoBuf = null;
      logoW = 0;
      logoH = 0;
    }
  }

  // Sharp text → black glyphs on transparent; negate to warm white.
  const textBlack = await sharp({
    text: {
      text: MOVIE_WATERMARK_LABEL,
      font: "sans",
      dpi: Math.max(120, Math.round(fontPx * 7.2)),
      rgba: true,
    },
  })
    .png()
    .toBuffer();
  const textMeta = await sharp(textBlack).metadata();
  const textW = textMeta.width ?? Math.ceil(MOVIE_WATERMARK_LABEL.length * fontPx * 0.55);
  const textH = textMeta.height ?? fontPx;
  const textWhite = await sharp(textBlack).negate({ alpha: false }).png().toBuffer();
  // Soft dark halo so light footage still reads the label.
  const textHalo = await sharp(textBlack)
    .blur(1.1)
    .ensureAlpha(0.55)
    .png()
    .toBuffer();

  const boxW = padX * 2 + logoW + (logoBuf ? gap : 0) + textW;
  const boxH = Math.max(logoH, textH) + padY * 2;
  const radius = Math.round(boxH / 2);

  const pillSvg = Buffer.from(
    `<svg width="${boxW}" height="${boxH}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" rx="${radius}" ry="${radius}"
        fill="rgba(10,8,6,0.48)"/>
</svg>`,
  );
  const pill = await sharp(pillSvg).png().toBuffer();

  const textLeft = padX + (logoBuf ? logoW + gap : 0);
  const textTop = Math.max(0, Math.round((boxH - textH) / 2));
  const logoTop = Math.max(0, Math.round((boxH - logoH) / 2));

  const layers: Array<{
    input: Buffer;
    left: number;
    top: number;
    blend?: "over";
  }> = [
    { input: textHalo, left: textLeft, top: textTop },
    { input: textWhite, left: textLeft, top: textTop },
  ];
  if (logoBuf) {
    layers.unshift({
      input: logoBuf,
      left: padX,
      top: logoTop,
      blend: "over",
    });
  }

  const path = join(workDir, "brand-watermark.png");
  await sharp(pill).composite(layers).png().toFile(path);

  return {
    path,
    width: boxW,
    height: boxH,
    margin,
    hasLogo: Boolean(logoBuf),
  };
}

/**
 * ffmpeg args: burn overlay at bottom-center of the finished movie.
 * Audio is optional (`0:a?`) so silent exports still succeed.
 */
export function buildBrandWatermarkFfmpegArgs(input: {
  videoPath: string;
  overlayPath: string;
  outputPath: string;
  margin: number;
  /** Prefer matching the main encode when available. */
  x264Preset?: string;
  crf?: number;
}): string[] {
  const margin = Math.max(0, Math.round(input.margin));
  const preset = input.x264Preset ?? "medium";
  const crf = input.crf ?? 16;
  return [
    "-y",
    "-i",
    input.videoPath,
    "-i",
    input.overlayPath,
    "-filter_complex",
    // Bottom-center — clearly in the lower frame, no extra letterbox bars.
    `[0:v][1:v]overlay=(W-w)/2:H-h-${margin}:format=auto[v]`,
    "-map",
    "[v]",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    preset,
    "-crf",
    String(crf),
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    input.outputPath,
  ];
}
