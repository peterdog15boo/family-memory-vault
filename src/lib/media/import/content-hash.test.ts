import { describe, expect, it } from "vitest";
import {
  normalizeContentHash,
  sha256HexFromBytes,
} from "@/lib/media/import/content-hash";

describe("content-hash", () => {
  it("normalizes valid sha256 hex", () => {
    const hex = "a".repeat(64);
    expect(normalizeContentHash(` ${hex.toUpperCase()} `)).toBe(hex);
  });

  it("rejects invalid hashes", () => {
    expect(normalizeContentHash("abc")).toBeNull();
    expect(normalizeContentHash(null)).toBeNull();
    expect(normalizeContentHash("g".repeat(64))).toBeNull();
  });

  it("hashes bytes stably", () => {
    const a = sha256HexFromBytes(Buffer.from("hello"));
    const b = sha256HexFromBytes(Buffer.from("hello"));
    const c = sha256HexFromBytes(Buffer.from("world"));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});
