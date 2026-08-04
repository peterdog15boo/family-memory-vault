import { describe, expect, it } from "vitest";
import {
  normalizeUploadContentType,
  resolveUploadContentType,
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
