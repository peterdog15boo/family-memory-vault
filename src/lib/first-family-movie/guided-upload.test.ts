import { describe, expect, it } from "vitest";
import {
  FFM_SOFT_MIN_PHOTOS,
  getGuidedUploadProgressCopy,
  getProcessingMicroCopy,
  isImageFile,
} from "@/lib/first-family-movie/guided-upload";

describe("getGuidedUploadProgressCopy", () => {
  it("blocks continue below the soft minimum", () => {
    for (let n = 0; n < FFM_SOFT_MIN_PHOTOS; n++) {
      expect(getGuidedUploadProgressCopy(n).canContinue).toBe(false);
    }
  });

  it("enables continue at 5 and above", () => {
    expect(getGuidedUploadProgressCopy(5).canContinue).toBe(true);
    expect(getGuidedUploadProgressCopy(6).canContinue).toBe(true);
    expect(getGuidedUploadProgressCopy(12).canContinue).toBe(true);
  });

  it("shows N of 5 progress under the minimum", () => {
    expect(getGuidedUploadProgressCopy(3).progressLine).toBe(
      "3 of 5 photos added…",
    );
  });

  it("allows more than 5 with clear copy", () => {
    const copy = getGuidedUploadProgressCopy(8);
    expect(copy.canContinue).toBe(true);
    expect(copy.progressLine).toBe("8 photos added");
  });
});

describe("getProcessingMicroCopy", () => {
  it("rotates through face / people lines", () => {
    expect(getProcessingMicroCopy(0)).toMatch(/people|faces|photo|ready/i);
    expect(getProcessingMicroCopy(1)).toMatch(/people|faces|photo|ready/i);
  });
});

describe("isImageFile", () => {
  it("accepts image MIME and common extensions", () => {
    expect(isImageFile(new File([], "a.jpg", { type: "image/jpeg" }))).toBe(
      true,
    );
    expect(isImageFile(new File([], "b.HEIC", { type: "" }))).toBe(true);
    expect(isImageFile(new File([], "c.mp4", { type: "video/mp4" }))).toBe(
      false,
    );
  });
});
