import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { prepareRekognitionModerationBytes } from "@/lib/moderation/providers/ai-moderation";

describe("prepareRekognitionModerationBytes", () => {
  it("passes through images already under 5MB", async () => {
    const small = await sharp({
      create: { width: 64, height: 64, channels: 3, background: "#abc" },
    })
      .jpeg({ quality: 80 })
      .toBuffer();
    const out = await prepareRekognitionModerationBytes(small);
    expect(out.byteLength).toBe(small.byteLength);
  });

  it("downscales images over Rekognition's 5MB Bytes limit", async () => {
    // Uncompressed RGB buffer forces a large JPEG even after compression.
    const width = 4000;
    const height = 3000;
    const pixels = Buffer.alloc(width * height * 3);
    for (let i = 0; i < pixels.length; i++) {
      pixels[i] = (i * 37 + (i % 251)) & 0xff;
    }
    const large = await sharp(pixels, {
      raw: { width, height, channels: 3 },
    })
      .jpeg({ quality: 95 })
      .toBuffer();

    expect(large.byteLength).toBeGreaterThan(5 * 1024 * 1024);

    const out = await prepareRekognitionModerationBytes(large);
    expect(out.byteLength).toBeLessThanOrEqual(5 * 1024 * 1024);
    expect(out.byteLength).toBeGreaterThan(0);
  }, 60_000);
});
