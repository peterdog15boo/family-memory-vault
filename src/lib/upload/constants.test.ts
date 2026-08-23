import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  canProxyUploadBytes,
  fileTooLargeMessage,
  formatUploadLimit,
  maxBytesForContentType,
  normalizeUploadContentType,
  resolveUploadContentType,
  uploadExpiresInForBytes,
} from "@/lib/upload/constants";

describe("resolveUploadContentType", () => {
  it("accepts standard JPEG type", () => {
    expect(
      resolveUploadContentType({
        filename: "photo.jpg",
        contentType: "image/jpeg",
      }),
    ).toBe("image/jpeg");
  });

  it("maps image/jpg alias", () => {
    expect(normalizeUploadContentType("image/jpg")).toBe("image/jpeg");
  });

  it("infers HEIC from extension when type is empty (iPhone)", () => {
    expect(
      resolveUploadContentType({
        filename: "IMG_1234.HEIC",
        contentType: "",
      }),
    ).toBe("image/heic");
  });

  it("infers JPEG from extension when type is octet-stream", () => {
    expect(
      resolveUploadContentType({
        filename: "vacation.jpeg",
        contentType: "application/octet-stream",
      }),
    ).toBe("image/jpeg");
  });

  it("infers MOV from extension", () => {
    expect(
      resolveUploadContentType({
        filename: "clip.mov",
        contentType: null,
      }),
    ).toBe("video/quicktime");
  });

  it("returns null for unknown types", () => {
    expect(
      resolveUploadContentType({
        filename: "notes.txt",
        contentType: "text/plain",
      }),
    ).toBeNull();
  });
});

describe("upload size matrix", () => {
  it("allows 50 MB photos and 2 GB videos", () => {
    expect(MAX_IMAGE_BYTES).toBe(50 * 1024 * 1024);
    expect(MAX_VIDEO_BYTES).toBe(2 * 1024 * 1024 * 1024);
    expect(maxBytesForContentType("image/jpeg")).toBe(MAX_IMAGE_BYTES);
    expect(maxBytesForContentType("video/mp4")).toBe(MAX_VIDEO_BYTES);
  });

  it("formats limits for UI and errors", () => {
    expect(formatUploadLimit(MAX_IMAGE_BYTES)).toBe("50 MB");
    expect(formatUploadLimit(MAX_VIDEO_BYTES)).toBe("2 GB");
    expect(fileTooLargeMessage("image/png")).toMatch(/50 MB/);
    expect(fileTooLargeMessage("video/webm")).toMatch(/2 GB/);
  });

  it("requires direct R2 for uploads above the proxy buffer cap", () => {
    expect(canProxyUploadBytes(100 * 1024 * 1024)).toBe(true);
    expect(canProxyUploadBytes(MAX_VIDEO_BYTES)).toBe(false);
    expect(uploadExpiresInForBytes(MAX_VIDEO_BYTES)).toBe(60 * 60);
  });
});
