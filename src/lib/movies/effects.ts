/**
 * Visual effects applied per frame (sharp pipeline).
 * Themes / filter presets supply ThemeColorGrade; this module owns pixel application.
 */

import sharp, { type Sharp } from "sharp";
import type { Rgb, ThemeColorGrade } from "@/lib/movies/themes";

function rgbCss(c: Rgb): string {
  return `rgb(${c.r},${c.g},${c.b})`;
}

async function createGrainOverlay(
  width: number,
  height: number,
  opacity: number,
): Promise<Buffer> {
  const gw = Math.max(64, Math.round(width / 4));
  const gh = Math.max(64, Math.round(height / 4));
  const raw = Buffer.alloc(gw * gh * 4);
  for (let i = 0; i < raw.length; i += 4) {
    const v = Math.floor(Math.random() * 255);
    raw[i] = v;
    raw[i + 1] = v;
    raw[i + 2] = v;
    raw[i + 3] = Math.round(opacity * 255);
  }
  return sharp(raw, { raw: { width: gw, height: gh, channels: 4 } })
    .resize(width, height, { kernel: "nearest" })
    .png()
    .toBuffer();
}

export type GradeOverlayPack = {
  overlays: { input: Buffer }[];
  brightness: number;
  saturation: number;
  hue: number;
  contrast: number;
};

/**
 * Build reusable grade overlays once per output size
 * (tint / split-tone / glow / vignette / light leak / grain).
 * Avoids regenerating expensive overlays on every Ken Burns sample.
 */
export async function prepareGradeOverlays(
  grade: ThemeColorGrade,
  width: number,
  height: number,
): Promise<GradeOverlayPack> {
  const overlays: { input: Buffer }[] = [];

  if (grade.shadowTint && (grade.shadowTintOpacity ?? 0) > 0) {
    const opacity = Math.min(0.4, grade.shadowTintOpacity ?? 0);
    const shadowSvg = Buffer.from(`
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="shadowTone" cx="50%" cy="55%" r="75%">
      <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="55%" stop-color="${rgbCss(grade.shadowTint)}" stop-opacity="${opacity * 0.35}"/>
      <stop offset="100%" stop-color="${rgbCss(grade.shadowTint)}" stop-opacity="${opacity}"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#shadowTone)"/>
</svg>`);
    overlays.push({ input: await sharp(shadowSvg).png().toBuffer() });
  }

  if (grade.tint && grade.tintOpacity > 0) {
    const tintSvg = Buffer.from(`
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${rgbCss(grade.tint)}" opacity="${grade.tintOpacity}"/>
</svg>`);
    overlays.push({ input: await sharp(tintSvg).png().toBuffer() });
  }

  if ((grade.glow ?? 0) > 0) {
    const glow = Math.min(0.45, grade.glow ?? 0);
    const glowSvg = Buffer.from(`
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="50%" cy="45%" r="55%">
      <stop offset="0%" stop-color="rgba(255,248,235,${glow})"/>
      <stop offset="45%" stop-color="rgba(255,230,210,${glow * 0.35})"/>
      <stop offset="100%" stop-color="rgba(255,230,210,0)"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#glow)"/>
</svg>`);
    overlays.push({ input: await sharp(glowSvg).png().toBuffer() });
  }

  if (grade.vignette) {
    const strength = Math.min(
      0.75,
      Math.max(0.15, grade.vignetteStrength || 0.35),
    );
    const vignetteSvg = Buffer.from(`
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="v" cx="50%" cy="50%" r="68%">
      <stop offset="45%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,${strength})"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#v)"/>
</svg>`);
    overlays.push({ input: await sharp(vignetteSvg).png().toBuffer() });
  }

  if (grade.lightLeak && grade.lightLeak > 0) {
    const leak = Math.min(0.45, grade.lightLeak);
    const leakSvg = Buffer.from(`
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="leak" cx="12%" cy="8%" r="55%">
      <stop offset="0%" stop-color="rgba(255,190,120,${leak})"/>
      <stop offset="55%" stop-color="rgba(255,120,80,${leak * 0.35})"/>
      <stop offset="100%" stop-color="rgba(255,120,80,0)"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#leak)"/>
</svg>`);
    overlays.push({ input: await sharp(leakSvg).png().toBuffer() });
  }

  if (grade.grain && grade.grain > 0) {
    overlays.push({
      input: await createGrainOverlay(
        width,
        height,
        Math.min(0.35, grade.grain),
      ),
    });
  }

  return {
    overlays,
    brightness: grade.brightness,
    saturation: grade.saturation,
    // Sharp modulate() requires an integer hue (degrees); lerp yields floats.
    hue: Math.round(grade.hue || 0),
    contrast: grade.contrast && grade.contrast !== 1 ? grade.contrast : 1,
  };
}

/** Fast path: modulate + prebuilt overlays (no SVG rebuild). */
export function applyPreparedGrade(
  pipeline: Sharp,
  pack: GradeOverlayPack,
): Sharp {
  const hue = Number.isFinite(pack.hue) ? Math.round(pack.hue) : 0;
  let next = pipeline.modulate({
    brightness: pack.brightness,
    saturation: pack.saturation,
    hue,
  });

  if (pack.contrast !== 1) {
    const c = pack.contrast;
    next = next.linear(c, -(128 * (c - 1)));
  }

  if (pack.overlays.length > 0) {
    next = next.composite(
      pack.overlays.map((o) => ({
        input: o.input,
        blend: "over" as const,
      })),
    );
  }
  return next;
}

/**
 * Apply color grade + optional vignette / grain / light leak / glow.
 */
export async function applyColorGrade(
  pipeline: Sharp,
  grade: ThemeColorGrade,
  width: number,
  height: number,
): Promise<Sharp> {
  const pack = await prepareGradeOverlays(grade, width, height);
  return applyPreparedGrade(pipeline, pack);
}

export async function applyLetterbox(
  pipeline: Sharp,
  width: number,
  height: number,
  background: Rgb,
  ratio: number,
): Promise<Sharp> {
  const bar = Math.max(
    8,
    Math.round(height * Math.min(Math.max(ratio, 0.04), 0.18)),
  );
  const barSvg = Buffer.from(`
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${width}" height="${bar}" fill="${rgbCss(background)}"/>
  <rect x="0" y="${height - bar}" width="${width}" height="${bar}" fill="${rgbCss(background)}"/>
</svg>`);
  const overlay = await sharp(barSvg).png().toBuffer();
  return pipeline.composite([{ input: overlay }]);
}
