import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import {
  buildMusicBedFilter,
  buildSlideshowMusicMuxArgs,
  effectiveMusicVolume,
  mixMovieAudio,
  parseFfmpegMediaProbe,
  probeAudioStream,
} from "@/lib/movies/music/mix";
import { getLibraryTrack } from "@/lib/movies/music/library";
import { libraryTrackAbsolutePath } from "@/lib/movies/music/resolve";

function resolveFfmpeg(): string | null {
  const fromEnv =
    process.env.FFMPEG_PATH?.trim() || process.env.FFMPEG_BIN?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  try {
    const require = createRequire(import.meta.url);
    const p = require("ffmpeg-static") as string | null;
    if (p && existsSync(p)) return p;
  } catch {
    /* optional */
  }
  return null;
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stderr = "";
    child.stderr?.on("data", (c: Buffer) => {
      stderr += c.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(-800) || `ffmpeg exit ${code}`));
    });
  });
}

describe("music bed filter + mux maps", () => {
  it("always includes volume and never silent anull alone", () => {
    const af = buildMusicBedFilter({
      volume: 0.55,
      durationSeconds: 12,
      fadeInMs: 1500,
      fadeOutMs: 2500,
      loop: true,
    });
    expect(af).toContain("volume=");
    expect(af).toContain("afade=t=in");
    expect(af).toContain("afade=t=out");
    expect(af).not.toBe("anull");
  });

  it("pads non-looping beds to the full movie duration", () => {
    const af = buildMusicBedFilter({
      volume: 0.5,
      durationSeconds: 20,
      fadeInMs: 0,
      fadeOutMs: 0,
      loop: false,
    });
    expect(af).toContain("apad=whole_dur=20.000");
  });

  it("lifts mix volume into an audible range", () => {
    expect(effectiveMusicVolume(0)).toBeGreaterThanOrEqual(0.08);
    expect(effectiveMusicVolume(0.55)).toBeGreaterThan(0.55);
    expect(effectiveMusicVolume(1)).toBeLessThanOrEqual(1.25);
  });

  it("maps slideshow mux as 0:v:0 + 1:a:0", () => {
    const args = buildSlideshowMusicMuxArgs({
      videoPath: "v.mp4",
      bedPath: "b.m4a",
      mixedPath: "out.mp4",
      durationSeconds: 10,
    });
    const mapIdx = args.indexOf("-map");
    expect(args[mapIdx + 1]).toBe("0:v:0");
    expect(args[args.indexOf("-map", mapIdx + 1) + 1]).toBe("1:a:0");
  });

  it("parses Audio stream + Duration from ffmpeg probe text", () => {
    const stderr = `
Input #0, mov, from 'out.mp4':
  Duration: 00:00:12.40, start: 0.000000, bitrate: 4000 kb/s
  Stream #0:0: Video: h264
  Stream #0:1: Audio: aac, 44100 Hz, stereo
`;
    expect(parseFfmpegMediaProbe(stderr)).toEqual({
      hasAudio: true,
      durationSeconds: 12.4,
    });
    expect(parseFfmpegMediaProbe("Stream #0:0: Video: h264").hasAudio).toBe(
      false,
    );
  });
});

describe("library music mix integration (ffmpeg)", () => {
  const ffmpegPath = resolveFfmpeg();
  const track = getLibraryTrack("soft-piano");
  const musicPath = track ? libraryTrackAbsolutePath(track) : "";

  it("mixes a library track into a silent H.264 and probes an audio stream", async () => {
    if (!ffmpegPath) {
      console.warn("skip: ffmpeg not available");
      return;
    }
    if (!track || !existsSync(musicPath)) {
      console.warn("skip: soft-piano.mp3 missing");
      return;
    }

    const workDir = await mkdtemp(join(tmpdir(), "fmv-music-"));
    try {
      const silentVideo = join(workDir, "silent.mp4");
      // 3s color slideshow stand-in (no audio).
      await runFfmpeg(ffmpegPath, [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=640x360:d=3",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-t",
        "3",
        silentVideo,
      ]);

      const before = await probeAudioStream(ffmpegPath, silentVideo);
      expect(before.hasAudio).toBe(false);

      const mixed = await mixMovieAudio({
        ffmpegPath,
        videoPath: silentVideo,
        music: {
          source: "library",
          localPath: musicPath,
          label: track.label,
          trackId: track.id,
          uploadKey: null,
          volume: 0.55,
          fadeInMs: 500,
          fadeOutMs: 800,
          loop: true,
          byteSize: 10000,
        },
        durationSeconds: 3,
        workDir,
        runFfmpeg,
      });

      const after = await probeAudioStream(ffmpegPath, mixed.path);
      expect(after.hasAudio).toBe(true);
      expect(after.durationSeconds ?? 3).toBeGreaterThan(2.5);

      // Decode ~1s of PCM and require non-trivial energy (audible outside browser).
      const pcmPath = join(workDir, "sample.s16le");
      await runFfmpeg(ffmpegPath, [
        "-y",
        "-i",
        mixed.path,
        "-t",
        "1.0",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "s16le",
        pcmPath,
      ]);
      const { readFile } = await import("node:fs/promises");
      const pcm = await readFile(pcmPath);
      expect(pcm.byteLength).toBeGreaterThan(1000);
      let sumSq = 0;
      for (let i = 0; i + 1 < pcm.byteLength; i += 2) {
        const sample = pcm.readInt16LE(i);
        sumSq += sample * sample;
      }
      const rms = Math.sqrt(sumSq / (pcm.byteLength / 2));
      expect(rms).toBeGreaterThan(200);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }, 60_000);
});
