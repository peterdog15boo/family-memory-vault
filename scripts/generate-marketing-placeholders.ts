/**
 * Generate soft marketing placeholders under /public/marketing.
 *
 * Usage: npx tsx scripts/generate-marketing-placeholders.ts
 *
 * Overwrites placeholder JPGs (and hero.mp4). Safe to re-run before shipping
 * final photography — then replace files in place (see docs/LANDING_MEDIA.md).
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";

const OUT = join(process.cwd(), "public", "marketing");

type Spec = {
  file: string;
  width: number;
  height: number;
  /** Soft multi-stop SVG gradients (emotional abstracts / still stand-ins) */
  stops: Array<{ color: string; opacity?: number; cx?: string; cy?: string; r?: string }>;
  base: string;
  /** Extra soft vignette strength 0–1 */
  vignette?: number;
};

const SPECS: Spec[] = [
  {
    file: "hero.jpg",
    width: 1920,
    height: 1080,
    base: "#2a2420",
    vignette: 0.45,
    stops: [
      { color: "#c4a88c", opacity: 0.55, cx: "35%", cy: "30%", r: "55%" },
      { color: "#b56f5e", opacity: 0.35, cx: "70%", cy: "55%", r: "50%" },
      { color: "#5c6b62", opacity: 0.28, cx: "50%", cy: "85%", r: "60%" },
      { color: "#f3ebe3", opacity: 0.2, cx: "50%", cy: "40%", r: "40%" },
    ],
  },
  {
    file: "abstract-preserve.jpg",
    width: 1600,
    height: 900,
    base: "#f0e8df",
    vignette: 0.3,
    stops: [
      { color: "#d4b896", opacity: 0.55, cx: "25%", cy: "40%", r: "50%" },
      { color: "#c47860", opacity: 0.22, cx: "75%", cy: "60%", r: "45%" },
      { color: "#8a9a8e", opacity: 0.2, cx: "55%", cy: "20%", r: "40%" },
    ],
  },
  {
    file: "still-privacy.jpg",
    width: 1200,
    height: 1500,
    base: "#e8eee9",
    vignette: 0.35,
    stops: [
      { color: "#6b8578", opacity: 0.4, cx: "40%", cy: "35%", r: "55%" },
      { color: "#c9b8a0", opacity: 0.35, cx: "70%", cy: "70%", r: "45%" },
      { color: "#f7f5f1", opacity: 0.45, cx: "50%", cy: "50%", r: "35%" },
    ],
  },
  {
    file: "still-movies.jpg",
    width: 1200,
    height: 1500,
    base: "#2c2422",
    vignette: 0.4,
    stops: [
      { color: "#b56f5e", opacity: 0.45, cx: "55%", cy: "40%", r: "45%" },
      { color: "#e8c4b0", opacity: 0.3, cx: "35%", cy: "60%", r: "40%" },
      { color: "#4a3f3a", opacity: 0.5, cx: "80%", cy: "80%", r: "50%" },
    ],
  },
  {
    file: "still-family.jpg",
    width: 1200,
    height: 1500,
    base: "#f2ebe4",
    vignette: 0.32,
    stops: [
      { color: "#c4a07a", opacity: 0.5, cx: "45%", cy: "30%", r: "50%" },
      { color: "#a67c6a", opacity: 0.3, cx: "65%", cy: "65%", r: "45%" },
      { color: "#7d8f84", opacity: 0.22, cx: "20%", cy: "75%", r: "40%" },
    ],
  },
  {
    file: "abstract-legacy.jpg",
    width: 1600,
    height: 900,
    base: "#1e2228",
    vignette: 0.5,
    stops: [
      { color: "#3d4a5c", opacity: 0.55, cx: "60%", cy: "35%", r: "55%" },
      { color: "#b56f5e", opacity: 0.22, cx: "30%", cy: "70%", r: "40%" },
      { color: "#8a9aab", opacity: 0.25, cx: "50%", cy: "50%", r: "35%" },
    ],
  },
  {
    file: "abstract-trust.jpg",
    width: 1600,
    height: 900,
    base: "#f4f2ef",
    vignette: 0.28,
    stops: [
      { color: "#d8d2c8", opacity: 0.6, cx: "50%", cy: "45%", r: "55%" },
      { color: "#a8b5ae", opacity: 0.25, cx: "30%", cy: "30%", r: "40%" },
      { color: "#c9b0a4", opacity: 0.2, cx: "70%", cy: "65%", r: "40%" },
    ],
  },
  {
    file: "abstract-promise.jpg",
    width: 1600,
    height: 900,
    base: "#f7f4f0",
    vignette: 0.25,
    stops: [
      { color: "#e8d5c4", opacity: 0.55, cx: "50%", cy: "40%", r: "50%" },
      { color: "#c4a88c", opacity: 0.25, cx: "40%", cy: "60%", r: "45%" },
      { color: "#faf8f5", opacity: 0.4, cx: "55%", cy: "35%", r: "30%" },
    ],
  },
  {
    file: "abstract-cta.jpg",
    width: 1600,
    height: 900,
    base: "#f5efe9",
    vignette: 0.3,
    stops: [
      { color: "#b56f5e", opacity: 0.28, cx: "50%", cy: "75%", r: "55%" },
      { color: "#c4a88c", opacity: 0.35, cx: "40%", cy: "30%", r: "45%" },
      { color: "#ebe4dc", opacity: 0.4, cx: "60%", cy: "50%", r: "40%" },
    ],
  },
];

function svgFor(spec: Spec): Buffer {
  const { width, height, base, stops, vignette = 0.3 } = spec;
  const circles = stops
    .map(
      (s) =>
        `<circle cx="${s.cx ?? "50%"}" cy="${s.cy ?? "50%"}" r="${s.r ?? "50%"}" fill="${s.color}" fill-opacity="${s.opacity ?? 0.4}" />`,
    )
    .join("\n");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="${Math.round(Math.min(width, height) * 0.045)}" />
    </filter>
    <radialGradient id="vig" cx="50%" cy="45%" r="70%">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="${vignette}"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="${base}"/>
  <g filter="url(#soft)">${circles}</g>
  <rect width="100%" height="100%" fill="url(#vig)"/>
</svg>`;

  return Buffer.from(svg);
}

async function writeJpeg(spec: Spec) {
  const path = join(OUT, spec.file);
  await sharp(svgFor(spec))
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(path);
  console.log(`wrote ${spec.file}`);
}

function resolveFfmpeg(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegPath = require("ffmpeg-static") as string | null;
    return ffmpegPath && existsSync(ffmpegPath) ? ffmpegPath : null;
  } catch {
    return null;
  }
}

function writeHeroVideo() {
  const ffmpeg = resolveFfmpeg();
  const poster = join(OUT, "hero.jpg");
  const out = join(OUT, "hero.mp4");

  if (!ffmpeg) {
    console.warn("ffmpeg-static not found — skip hero.mp4 (poster still works)");
    return;
  }
  if (!existsSync(poster)) {
    console.warn("hero.jpg missing — skip hero.mp4");
    return;
  }

  const result = spawnSync(
    ffmpeg,
    [
      "-y",
      "-loop",
      "1",
      "-i",
      poster,
      "-vf",
      "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,zoompan=z='min(zoom+0.0004,1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=288:s=1280x720:fps=24",
      "-t",
      "12",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-an",
      out,
    ],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    console.warn("ffmpeg hero.mp4 failed:", result.stderr?.slice(-500));
    return;
  }
  console.log("wrote hero.mp4");
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  for (const spec of SPECS) {
    await writeJpeg(spec);
  }

  writeHeroVideo();

  writeFileSync(
    join(OUT, ".placeholders-generated"),
    `Generated ${new Date().toISOString()}\nReplace files in place — see docs/LANDING_MEDIA.md\n`,
  );

  console.log("Done. Drop final assets over the same filenames in public/marketing/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
