import { describe, expect, it } from "vitest";
import { computeNotificationPanelPos } from "./notification-panel-position";

describe("notification panel viewport clamp", () => {
  it("keeps a left-half iPhone portrait panel fully on-screen (full width)", () => {
    const pos = computeNotificationPanelPos({
      trigger: { left: 94, right: 127, top: 26, bottom: 59, width: 33 },
      vw: 390,
      vh: 844,
      panelHeight: 420,
    });
    expect(pos.left).toBe(8);
    expect(pos.width).toBe(390 - 16);
    expect(pos.left + pos.width).toBeLessThanOrEqual(390 - 8);
    expect(pos.top).toBeGreaterThanOrEqual(8);
    expect(pos.top + 420).toBeLessThanOrEqual(844 - 8);
  });

  it("uses a full-width sheet in phone landscape", () => {
    const pos = computeNotificationPanelPos({
      trigger: { left: 700, right: 733, top: 8, bottom: 40, width: 33 },
      vw: 844,
      vh: 390,
      panelHeight: 280,
    });
    expect(pos.left).toBe(8);
    expect(pos.width).toBe(844 - 16);
    expect(pos.left + pos.width).toBeLessThanOrEqual(844 - 8);
  });

  it("right-aligns on desktop when the trigger is on the right half", () => {
    const pos = computeNotificationPanelPos({
      trigger: { left: 1180, right: 1216, top: 20, bottom: 56, width: 36 },
      vw: 1280,
      vh: 800,
      panelHeight: 200,
    });
    expect(pos.width).toBe(24 * 16);
    expect(pos.left + pos.width).toBeCloseTo(1216, 0);
    expect(pos.left).toBeGreaterThanOrEqual(8);
  });

  it("flips above when there is no room below", () => {
    const pos = computeNotificationPanelPos({
      trigger: { left: 20, right: 53, top: 700, bottom: 733, width: 33 },
      vw: 390,
      vh: 844,
      panelHeight: 300,
    });
    expect(pos.top + 300).toBeLessThanOrEqual(844 - 8);
    expect(pos.top).toBeLessThan(700);
  });
});
