import { describe, expect, it } from "vitest";
import {
  avatarImageLayoutStyle,
  framingFromFaceBox,
  resolveAvatarFraming,
} from "@/lib/people/avatar-framing";

describe("framingFromFaceBox", () => {
  it("centers on the face and zooms small faces up", () => {
    const framing = framingFromFaceBox({
      x: 0.4,
      y: 0.2,
      width: 0.08,
      height: 0.1,
    });
    expect(framing.focusX).toBeCloseTo(0.44, 2);
    expect(framing.focusY).toBeGreaterThan(0.2);
    expect(framing.focusY).toBeLessThan(0.35);
    expect(framing.zoom).toBeGreaterThan(2);
  });

  it("avoids extreme zoom for large close-up faces", () => {
    const framing = framingFromFaceBox({
      x: 0.25,
      y: 0.15,
      width: 0.45,
      height: 0.5,
    });
    expect(framing.zoom).toBeLessThan(2);
    expect(framing.zoom).toBeGreaterThanOrEqual(1);
  });
});

describe("resolveAvatarFraming", () => {
  it("prefers stored manual framing when complete", () => {
    const framing = resolveAvatarFraming(
      { avatarFocusX: 0.2, avatarFocusY: 0.3, avatarZoom: 2.5 },
      { x: 0.4, y: 0.4, width: 0.2, height: 0.2 },
    );
    expect(framing).toEqual({ focusX: 0.2, focusY: 0.3, zoom: 2.5 });
  });

  it("falls back to face box when framing is incomplete", () => {
    const framing = resolveAvatarFraming(
      { avatarFocusX: 0.2, avatarFocusY: null, avatarZoom: 2 },
      { x: 0, y: 0, width: 0.5, height: 0.5 },
    );
    expect(framing.focusX).toBeCloseTo(0.25, 2);
  });
});

describe("avatarImageLayoutStyle", () => {
  it("keeps the focus point at the container center", () => {
    const style = avatarImageLayoutStyle(2000, 1000, {
      focusX: 0.25,
      focusY: 0.5,
      zoom: 2,
    });
    const widthPct = Number.parseFloat(String(style.width));
    const leftPct = Number.parseFloat(String(style.left));
    // focusX * width + left === 50
    expect(0.25 * widthPct + leftPct).toBeCloseTo(50, 5);
  });
});
