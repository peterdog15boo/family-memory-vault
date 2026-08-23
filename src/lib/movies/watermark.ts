/**
 * Free-plan movie brand watermark — burned into the final MP4.
 *
 * Soft left-bottom mark: light logo + small ghosted label, no background pill.
 * Text uses a bundled font so Linux workers never show tofu □□□ boxes.
 * Plan policy stays in watermark-policy.ts.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { MOVIE_WATERMARK_LABEL } from "@/lib/movies/watermark-policy";

export type BrandWatermarkOverlay = {
  path: string;
  width: number;
  height: number;
  /** Bottom inset in output pixels. */
  margin: number;
  /** Left inset in output pixels. */
  leftMargin: number;
  hasLogo: boolean;
};

/** Bundled URW Nimbus Sans — ships with the app so Railway/Vercel always have glyphs. */
export function resolveWatermarkFontPath(): string | null {
  const candidates = [
    join(process.cwd(), "assets", "fonts", "NimbusSans-Regular.otf"),
    join(__dirname, "..", "..", "..", "assets", "fonts", "NimbusSans-Regular.otf"),
  ];
  for (const p of candidates) {
    try {
      if (existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Build a transparent bottom-left overlay: light logo + smaller ghosted label.
 * No pill / bubble behind the mark.
 */
export async function buildBrandWatermarkOverlay(input: {
  workDir: string;
  width: number;
  height: number;
}): Promise<BrandWatermarkOverlay> {
  const { workDir, width, height } = input;
  const margin = Math.max(18, Math.round(height * 0.028));
  const leftMargin = Math.max(18, Math.round(width * 0.022));
  // Smaller type than the logo treatment — soft and non-intrusive.
  const fontPx = Math.max(12, Math.round(height * 0.018));
  const logoMaxH = Math.max(36, Math.round(height * 0.07));
  const gap = Math.max(8, Math.round(width * 0.008));

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
      // Flatten to warm-white using the logo alpha, then ghost (~90% —
      // ~2× the prior 45% so the mark reads brighter than the label).
      const resized = await sharp(logoSrc)
        .resize(logoW, logoH, { fit: "inside", kernel: "lanczos3" })
        .ensureAlpha()
        .png()
        .toBuffer();
      const sized = await sharp(resized).metadata();
      logoW = sized.width ?? logoW;
      logoH = sized.height ?? logoH;
      const alpha = await sharp(resized).extractChannel("alpha").toBuffer();
      const whiteLockup = await sharp({
        create: {
          width: logoW,
          height: logoH,
          channels: 3,
          background: { r: 255, g: 250, b: 245 },
        },
      })
        .joinChannel(alpha)
        .png()
        .toBuffer();
      logoBuf = await sharp(whiteLockup)
        .composite([
          {
            input: Buffer.from([255, 255, 255, Math.round(255 * 0.9)]),
            raw: { width: 1, height: 1, channels: 4 },
            tile: true,
            blend: "dest-in",
          },
        ])
        .png()
        .toBuffer();
    } catch {
      logoBuf = null;
      logoW = 0;
      logoH = 0;
    }
  }

  const textBlack = await renderWatermarkLabel(fontPx);
  const textMeta = await sharp(textBlack).metadata();
  const textW =
    textMeta.width ?? Math.ceil(MOVIE_WATERMARK_LABEL.length * fontPx * 0.55);
  const textH = textMeta.height ?? fontPx;

  // Ghosted warm-white type (~42% opacity) + very soft dark halo for light scenes.
  const textWhite = await sharp(textBlack)
    .negate({ alpha: false })
    .ensureAlpha(0.42)
    .png()
    .toBuffer();
  const textHalo = await sharp(textBlack)
    .blur(0.9)
    .ensureAlpha(0.22)
    .png()
    .toBuffer();

  const boxW = Math.max(1, logoW + (logoBuf ? gap : 0) + textW);
  const boxH = Math.max(logoH, textH);

  const canvas = await sharp({
    create: {
      width: boxW,
      height: boxH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();

  const textLeft = logoBuf ? logoW + gap : 0;
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
      left: 0,
      top: logoTop,
      blend: "over",
    });
  }

  const path = join(workDir, "brand-watermark.png");
  await sharp(canvas).composite(layers).png().toFile(path);

  return {
    path,
    width: boxW,
    height: boxH,
    margin,
    leftMargin,
    hasLogo: Boolean(logoBuf),
  };
}

/**
 * Render the watermark sentence with the bundled font whenever possible.
 * Falls back to SVG + embedded @font-face (same file) if sharp text fails.
 */
async function renderWatermarkLabel(fontPx: number): Promise<Buffer> {
  const fontfile = resolveWatermarkFontPath();
  const dpi = Math.max(140, Math.round(fontPx * 8));

  if (fontfile) {
    try {
      return await sharp({
        text: {
          text: MOVIE_WATERMARK_LABEL,
          fontfile,
          dpi,
          rgba: true,
        },
      })
        .png()
        .toBuffer();
    } catch (err) {
      console.warn("[movies] sharp text+fontfile failed — trying SVG embed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } else {
    console.warn(
      "[movies] Watermark font missing at assets/fonts/NimbusSans-Regular.otf",
    );
  }

  if (fontfile) {
    const { readFileSync } = await import("node:fs");
    const b64 = readFileSync(fontfile).toString("base64");
    const approxW = Math.ceil(MOVIE_WATERMARK_LABEL.length * fontPx * 0.58);
    const h = Math.ceil(fontPx * 1.45);
    const svg = `<svg width="${approxW}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style type="text/css"><![CDATA[
      @font-face {
        font-family: 'WMSans';
        src: url('data:font/otf;base64,${b64}') format('opentype');
      }
    ]]></style>
  </defs>
  <text x="0" y="${Math.round(fontPx * 1.05)}"
        font-family="WMSans, Arial, Helvetica, sans-serif"
        font-size="${fontPx}" fill="#000">${escapeXml(MOVIE_WATERMARK_LABEL)}</text>
</svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
  }

  const approxW = Math.ceil(MOVIE_WATERMARK_LABEL.length * fontPx * 0.58);
  const h = Math.ceil(fontPx * 1.45);
  const svg = `<svg width="${approxW}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <text x="0" y="${Math.round(fontPx * 1.05)}"
        font-family="Arial, Helvetica, DejaVu Sans, sans-serif"
        font-size="${fontPx}" fill="#000">${escapeXml(MOVIE_WATERMARK_LABEL)}</text>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * ffmpeg args: burn overlay at bottom-left of the finished movie.
 * Audio is optional (`0:a?`) so silent exports still succeed.
 */
export function buildBrandWatermarkFfmpegArgs(input: {
  videoPath: string;
  overlayPath: string;
  outputPath: string;
  margin: number;
  leftMargin?: number;
  /** Prefer matching the main encode when available. */
  x264Preset?: string;
  crf?: number;
}): string[] {
  const margin = Math.max(0, Math.round(input.margin));
  const left = Math.max(0, Math.round(input.leftMargin ?? margin));
  const preset = input.x264Preset ?? "medium";
  const crf = input.crf ?? 16;
  return [
    "-y",
    "-i",
    input.videoPath,
    "-i",
    input.overlayPath,
    "-filter_complex",
    // Bottom-left — no letterbox bars, soft brand in the lower frame.
    `[0:v][1:v]overlay=${left}:H-h-${margin}:format=auto[v]`,
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
