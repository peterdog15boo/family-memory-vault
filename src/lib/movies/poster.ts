/**
 * Compose a polished poster/thumbnail for a finished movie.
 */

import sharp from "sharp";
import type { MovieThemeDefinition } from "@/lib/movies/themes";
import { scaleThemeFontSize } from "@/lib/movies/output";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Cap poster long-edge so thumbnails stay light even for 4K exports. */
const POSTER_MAX_LONG_EDGE = 1920;

function posterDimensions(width: number, height: number): {
  width: number;
  height: number;
} {
  const long = Math.max(width, height);
  if (long <= POSTER_MAX_LONG_EDGE) return { width, height };
  const scale = POSTER_MAX_LONG_EDGE / long;
  return {
    width: Math.max(2, Math.round(width * scale) & ~1),
    height: Math.max(2, Math.round(height * scale) & ~1),
  };
}

/**
 * Build a share-ready poster: cover still + soft gradient + title.
 * Falls back to a solid themed card when no still is available.
 * `style: "photo"` skips the title overlay (raw framed still).
 */
export async function composeMoviePoster(options: {
  width: number;
  height: number;
  title: string;
  theme: MovieThemeDefinition;
  /** Prefer a mid-clip still JPEG when available */
  coverJpeg?: Buffer | null;
  /** titled (default) burns title; photo is a clean still. */
  style?: "photo" | "titled";
}): Promise<Buffer> {
  const { width, height } = posterDimensions(options.width, options.height);
  const style = options.style ?? "titled";

  if (style === "photo" && options.coverJpeg?.byteLength) {
    return sharp(options.coverJpeg)
      .rotate()
      .resize(width, height, {
        fit: "cover",
        position: "centre",
        kernel: "lanczos3",
      })
      .jpeg({ quality: 95, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toBuffer();
  }

  const { title, theme } = options;
  const titleSize = scaleThemeFontSize(theme.text.titleFontSize, height);
  const tagSize = scaleThemeFontSize(theme.text.taglineFontSize, height);
  const fill = theme.text.fill;
  const accent = theme.text.accentFill;
  const bg = theme.palette.background;
  const safeTitle = escapeXml(title.slice(0, 72));
  const tagline = escapeXml(
    (theme.text.taglines[0] || theme.label).slice(0, 64),
  );

  const overlaySvg = Buffer.from(`
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(0,0,0,0.15)"/>
      <stop offset="45%" stop-color="rgba(0,0,0,0.05)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.62)"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#veil)"/>
  <rect x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.72)}" width="${Math.round(width * 0.12)}" height="3" fill="${accent}" opacity="0.9"/>
  <text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.82)}"
        font-family="${theme.text.fontFamily}" font-size="${titleSize}"
        font-weight="600" fill="${fill}">${safeTitle}</text>
  <text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.88)}"
        font-family="${theme.text.fontFamily}" font-size="${tagSize}"
        fill="${fill}" opacity="0.8">${tagline}</text>
</svg>`);

  if (options.coverJpeg?.byteLength) {
    return sharp(options.coverJpeg)
      .rotate()
      .resize(width, height, {
        fit: "cover",
        position: "centre",
        kernel: "lanczos3",
      })
      .composite([{ input: await sharp(overlaySvg).png().toBuffer() }])
      .jpeg({ quality: 95, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toBuffer();
  }

  const cardSvg = Buffer.from(`
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="rgb(${bg.r},${bg.g},${bg.b})"/>
  <rect x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.46)}" width="${Math.round(width * 0.14)}" height="3" fill="${accent}"/>
  <text x="50%" y="54%" text-anchor="middle"
        font-family="${theme.text.fontFamily}" font-size="${titleSize}"
        font-weight="600" fill="${fill}">${safeTitle}</text>
  <text x="50%" y="62%" text-anchor="middle"
        font-family="${theme.text.fontFamily}" font-size="${tagSize}"
        fill="${fill}" opacity="0.75">${tagline}</text>
</svg>`);

  return sharp(cardSvg)
    .jpeg({ quality: 95, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
}
