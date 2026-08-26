import { describe, expect, it } from "vitest";
import {
  FFM_CREATE_ANTICIPATION_LINES,
  FFM_LONG_WAIT_MS,
  getCreateAnticipationLine,
} from "@/lib/first-family-movie/create-copy";
import {
  FFM_FAST_MAX_PHOTOS,
  buildFirstFamilyMovieSettings,
  firstFamilyMovieDurationSettings,
} from "@/lib/first-family-movie/create";

describe("getCreateAnticipationLine", () => {
  it("rotates the four anticipation lines", () => {
    expect(getCreateAnticipationLine(0)).toBe(FFM_CREATE_ANTICIPATION_LINES[0]);
    expect(getCreateAnticipationLine(1)).toBe(FFM_CREATE_ANTICIPATION_LINES[1]);
    expect(getCreateAnticipationLine(2)).toBe(FFM_CREATE_ANTICIPATION_LINES[2]);
    expect(getCreateAnticipationLine(3)).toBe(FFM_CREATE_ANTICIPATION_LINES[3]);
    expect(getCreateAnticipationLine(4)).toBe(FFM_CREATE_ANTICIPATION_LINES[0]);
  });
});

describe("FFM_LONG_WAIT_MS", () => {
  it("is about 30 seconds", () => {
    expect(FFM_LONG_WAIT_MS).toBe(30_000);
  });
});

describe("firstFamilyMovieDurationSettings", () => {
  it("keeps duration in a snappy 24–42s band", () => {
    const five = firstFamilyMovieDurationSettings(5);
    const ten = firstFamilyMovieDurationSettings(10);
    const fiveSec = five.targetDurationSeconds ?? 0;
    const tenSec = ten.targetDurationSeconds ?? 0;
    expect(fiveSec).toBeGreaterThanOrEqual(24);
    expect(fiveSec).toBeLessThanOrEqual(42);
    expect(tenSec).toBeGreaterThanOrEqual(fiveSec);
    expect(tenSec).toBeLessThanOrEqual(42);
  });

  it("caps photo count for duration math", () => {
    const many = firstFamilyMovieDurationSettings(40);
    const capped = firstFamilyMovieDurationSettings(FFM_FAST_MAX_PHOTOS);
    expect(many.targetDurationSeconds).toBe(capped.targetDurationSeconds);
  });
});

describe("buildFirstFamilyMovieSettings", () => {
  it("uses share-ready 1080p encode for the first reveal", () => {
    const settings = buildFirstFamilyMovieSettings(6);
    expect(settings.qualityMode).toBe("standard");
    expect(settings.includeTitles).toBe(false);
    expect(settings.transition).toBe("soft_dissolve");
  });
});
