/**
 * Mix background music under a rendered slideshow MP4 via ffmpeg.
 *
 * - Loop (or pad) music to cover the full movie duration
 * - Fade in at start / fade out at end
 * - Soft-duck music when the video already has an audio track (future video clips)
 * - Verify the output actually contains an audio stream
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ResolvedMovieMusic } from "@/lib/movies/music/resolve";
import { MovieError } from "@/lib/movies/errors";

export type MixMovieAudioInput = {
  ffmpegPath: string;
  /** Silent or video+audio slideshow MP4 */
  videoPath: string;
  music: ResolvedMovieMusic;
  durationSeconds: number;
  workDir: string;
  /** Spawn helper from generator (keeps one ffmpeg runner). */
  runFfmpeg: (bin: string, args: string[]) => Promise<void>;
};

export type AudioStreamProbe = {
  hasAudio: boolean;
  /** Parsed from ffmpeg -i Duration line when present. */
  durationSeconds: number | null;
};

/** Parse ffmpeg -i stderr for Audio: streams and Duration. */
export function parseFfmpegMediaProbe(stderr: string): AudioStreamProbe {
  const hasAudio = /Stream #\d+:\d+.*Audio:/i.test(stderr);
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  let durationSeconds: number | null = null;
  if (m) {
    durationSeconds =
      Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    if (!Number.isFinite(durationSeconds)) durationSeconds = null;
  }
  return { hasAudio, durationSeconds };
}

export async function probeAudioStream(
  ffmpegPath: string,
  filePath: string,
): Promise<AudioStreamProbe> {
  return new Promise((resolve) => {
    const child = spawn(ffmpegPath, ["-i", filePath], { windowsHide: true });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", () => resolve({ hasAudio: false, durationSeconds: null }));
    child.on("close", () => resolve(parseFfmpegMediaProbe(stderr)));
  });
}

async function videoHasAudioStream(
  ffmpegPath: string,
  videoPath: string,
): Promise<boolean> {
  const probe = await probeAudioStream(ffmpegPath, videoPath);
  return probe.hasAudio;
}

/**
 * Effective mix volume: user slider plus a gentle lift so soft library beds
 * are clearly audible in players (grayed speaker = no track; quiet = hard to notice).
 */
export function effectiveMusicVolume(userVolume: number): number {
  const base = Math.min(1, Math.max(0, userVolume));
  return Math.min(1.25, Math.max(0.08, base * 1.4));
}

/**
 * Build the `-af` chain for the music bed (volume, fades, pad to full duration).
 * Exported for unit tests — must never degrade to silent `anull` alone.
 */
export function buildMusicBedFilter(input: {
  volume: number;
  durationSeconds: number;
  fadeInMs: number;
  fadeOutMs: number;
  /** When false, pad with silence so the bed still spans the full movie. */
  loop: boolean;
}): string {
  const dur = Math.max(0.5, input.durationSeconds);
  const fadeIn = Math.min(input.fadeInMs / 1000, dur / 2);
  const fadeOut = Math.min(input.fadeOutMs / 1000, dur / 2);
  const fadeOutStart = Math.max(0, dur - fadeOut);
  const volume = effectiveMusicVolume(input.volume);

  const parts: string[] = [`volume=${volume.toFixed(3)}`];
  if (fadeIn > 0.05) {
    parts.push(`afade=t=in:st=0:d=${fadeIn.toFixed(3)}`);
  }
  if (fadeOut > 0.05) {
    parts.push(
      `afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeOut.toFixed(3)}`,
    );
  }
  // Non-looping short tracks: pad to whole_dur so mux maps a full-length stream
  // (avoids ending the audio early while the video continues).
  if (!input.loop) {
    parts.push(`apad=whole_dur=${dur.toFixed(3)}`);
  }
  return parts.join(",");
}

/** Explicit mux args for slideshow (video has no audio) — used in tests. */
export function buildSlideshowMusicMuxArgs(input: {
  videoPath: string;
  bedPath: string;
  mixedPath: string;
  durationSeconds: number;
}): string[] {
  const dur = Math.max(0.5, input.durationSeconds);
  return [
    "-y",
    "-i",
    input.videoPath,
    "-i",
    input.bedPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ac",
    "2",
    "-ar",
    "44100",
    "-t",
    dur.toFixed(3),
    "-movflags",
    "+faststart",
    input.mixedPath,
  ];
}

/**
 * Returns a new MP4 path with music mixed in.
 */
export async function mixMovieAudio(
  input: MixMovieAudioInput,
): Promise<{ buffer: Buffer; path: string }> {
  const {
    ffmpegPath,
    videoPath,
    music,
    durationSeconds,
    workDir,
    runFfmpeg,
  } = input;

  if (!existsSync(music.localPath)) {
    throw new MovieError("Music file not found for mix.", {
      retryable: false,
      code: "validation",
    });
  }

  const dur = Math.max(0.5, durationSeconds);
  const bedFilter = buildMusicBedFilter({
    volume: music.volume,
    durationSeconds: dur,
    fadeInMs: music.fadeInMs,
    fadeOutMs: music.fadeOutMs,
    loop: music.loop,
  });

  const bedPath = join(workDir, "music_bed.m4a");
  const mixedPath = join(workDir, "output_with_music.mp4");

  console.info("[movies.music] Mixing bed", {
    localPath: music.localPath,
    loop: music.loop,
    volume: music.volume,
    effectiveVolume: effectiveMusicVolume(music.volume),
    fadeInMs: music.fadeInMs,
    fadeOutMs: music.fadeOutMs,
    durationSeconds: dur,
    bedFilter,
  });

  try {
    await runFfmpeg(ffmpegPath, [
      "-y",
      // Always loop the source into the bed window when loop is on; when off,
      // apad in the filter chain fills remaining duration with silence.
      ...(music.loop ? ["-stream_loop", "-1"] : []),
      "-i",
      music.localPath,
      "-t",
      dur.toFixed(3),
      "-af",
      bedFilter,
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ac",
      "2",
      "-ar",
      "44100",
      bedPath,
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new MovieError(`Music bed encode failed: ${msg.slice(0, 400)}`, {
      retryable: true,
    });
  }

  const bedProbe = await probeAudioStream(ffmpegPath, bedPath);
  if (!bedProbe.hasAudio) {
    throw new MovieError("Music bed encode produced no audio stream.", {
      retryable: false,
    });
  }
  if (
    bedProbe.durationSeconds != null &&
    bedProbe.durationSeconds + 0.35 < dur * 0.9
  ) {
    throw new MovieError(
      `Music bed is too short (${bedProbe.durationSeconds.toFixed(2)}s) for a ${dur.toFixed(2)}s movie. Loop/pad failed.`,
      { retryable: true },
    );
  }

  const hasVideoAudio = await videoHasAudioStream(ffmpegPath, videoPath);

  try {
    if (hasVideoAudio) {
      // Soft-duck music under existing video audio (dialogue / clip sound).
      const filterComplex = [
        "[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume=1.0[va]",
        "[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo[ma]",
        "[ma][va]sidechaincompress=threshold=0.05:ratio=6:attack=50:release=300:level_sc=0.85[ducked]",
        "[va][ducked]amix=inputs=2:duration=first:dropout_transition=0[aout]",
      ].join(";");

      await runFfmpeg(ffmpegPath, [
        "-y",
        "-i",
        videoPath,
        "-i",
        bedPath,
        "-filter_complex",
        filterComplex,
        "-map",
        "0:v:0",
        "-map",
        "[aout]",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        "-movflags",
        "+faststart",
        mixedPath,
      ]);
    } else {
      const muxArgs = buildSlideshowMusicMuxArgs({
        videoPath,
        bedPath,
        mixedPath,
        durationSeconds: dur,
      });
      console.info("[movies.music] Mux maps", {
        mapVideo: "0:v:0",
        mapAudio: "1:a:0",
        durationSeconds: dur,
      });
      await runFfmpeg(ffmpegPath, muxArgs);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new MovieError(`Music mix failed: ${msg.slice(0, 400)}`, {
      retryable: true,
    });
  }

  const mixedProbe = await probeAudioStream(ffmpegPath, mixedPath);
  if (!mixedProbe.hasAudio) {
    throw new MovieError(
      "Music mix produced a video without an audio track (ffmpeg did not map 1:a:0).",
      { retryable: false },
    );
  }
  if (
    mixedProbe.durationSeconds != null &&
    mixedProbe.durationSeconds + 0.5 < dur * 0.85
  ) {
    throw new MovieError(
      `Mixed export audio is too short (${mixedProbe.durationSeconds.toFixed(2)}s vs ${dur.toFixed(2)}s video).`,
      { retryable: true },
    );
  }

  const buffer = await readFile(mixedPath);
  if (buffer.byteLength < 32) {
    throw new MovieError("Music mix produced an empty video.");
  }

  return { buffer, path: mixedPath };
}
