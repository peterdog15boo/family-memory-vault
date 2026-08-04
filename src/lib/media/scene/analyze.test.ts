/**
 * Unit tests for scene eligibility + video frame planning / vision aggregation.
 */

import { describe, expect, it } from "vitest";
import { aggregateVisionResults } from "@/lib/ai/vision";
import {
  isEligibleSceneMedia,
  isEligibleScenePhoto,
} from "@/lib/media/scene/analyze";
import {
  DEFAULT_VIDEO_FRAME_FRACTIONS,
  planVideoSampleOffsets,
} from "@/lib/media/video-frames";
import { parseFfmpegDurationSec } from "@/lib/media/ffmpeg";

describe("scene analysis eligibility", () => {
  it("accepts clean ready photos", () => {
    expect(
      isEligibleScenePhoto({
        type: "photo",
        status: "ready",
        moderationStatus: "clean",
        contentType: "image/jpeg",
      }),
    ).toBe(true);
  });

  it("accepts clean ready videos", () => {
    expect(
      isEligibleSceneMedia({
        type: "video",
        status: "ready",
        moderationStatus: "clean",
        contentType: "video/mp4",
      }),
    ).toBe(true);
  });

  it("rejects unclean media and mismatched content types", () => {
    expect(
      isEligibleSceneMedia({
        type: "photo",
        status: "ready",
        moderationStatus: "pending",
        contentType: "image/jpeg",
      }),
    ).toBe(false);
    expect(
      isEligibleSceneMedia({
        type: "video",
        status: "ready",
        moderationStatus: "clean",
        contentType: "image/jpeg",
      }),
    ).toBe(false);
  });
});

describe("planVideoSampleOffsets", () => {
  it("samples start / quarters / near end for a normal clip", () => {
    const plan = planVideoSampleOffsets(100, {
      maxFrames: 5,
      fractions: DEFAULT_VIDEO_FRAME_FRACTIONS,
    });
    expect(plan).toHaveLength(5);
    expect(plan[0]!.offsetSec).toBeCloseTo(2, 5);
    expect(plan[1]!.offsetSec).toBeCloseTo(25, 5);
    expect(plan[2]!.offsetSec).toBeCloseTo(50, 5);
    expect(plan[3]!.offsetSec).toBeCloseTo(75, 5);
    expect(plan[4]!.offsetSec).toBeCloseTo(92, 5);
  });

  it("dedupes offsets on very short clips", () => {
    const plan = planVideoSampleOffsets(0.4, { maxFrames: 5 });
    expect(plan.length).toBeGreaterThanOrEqual(1);
    expect(plan.length).toBeLessThanOrEqual(5);
    const keys = new Set(plan.map((p) => p.offsetSec.toFixed(2)));
    expect(keys.size).toBe(plan.length);
  });

  it("falls back to fixed seeks when duration is unknown", () => {
    const plan = planVideoSampleOffsets(0, { maxFrames: 3 });
    expect(plan).toHaveLength(3);
    expect(plan[0]!.offsetSec).toBe(0.1);
  });
});

describe("parseFfmpegDurationSec", () => {
  it("parses Duration from ffmpeg stderr", () => {
    const stderr =
      "Input #0, mov, from 'x.mp4':\n  Duration: 00:01:23.45, start: 0.000000, bitrate: 1000 kb/s\n";
    expect(parseFfmpegDurationSec(stderr)).toBeCloseTo(83.45, 2);
  });
});

describe("aggregateVisionResults", () => {
  it("merges labels by frequency and keeps the richest caption", () => {
    const merged = aggregateVisionResults([
      {
        caption: "A beach",
        tags: ["beach", "sand"],
        objects: ["person"],
        scenes: ["outdoors"],
        description: "short",
        embedding: null,
        provider: "rekognition",
      },
      {
        caption: "Family on a sunny beach near the ocean",
        tags: ["beach", "ocean", "family"],
        objects: ["person", "umbrella"],
        scenes: ["outdoors", "beach"],
        description: "A longer description of the sunny beach day with family.",
        embedding: [0.1, 0.2],
        provider: "openai",
      },
    ]);

    expect(merged.caption).toContain("Family");
    expect(merged.tags).toContain("beach");
    expect(merged.objects).toContain("umbrella");
    expect(merged.scenes).toContain("outdoors");
    expect(merged.provider).toContain("video-frames");
    expect(merged.embedding).toEqual([0.1, 0.2]);
  });

  it("returns empty-normalized result for no inputs", () => {
    const empty = aggregateVisionResults([]);
    expect(empty.provider).toBe("none");
    expect(empty.tags).toEqual([]);
  });
});
