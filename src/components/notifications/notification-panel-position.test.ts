import { describe, expect, it } from "vitest";

/**
 * Mirrors NotificationBell.updatePanelPosition clamp rules so mobile
 * anchoring can be verified without a flaky browser resize harness.
 */
function computeNotificationPanelPos(input: {
  trigger: { left: number; right: number; top: number; bottom: number; width: number };
  vw: number;
  vh: number;
  panelHeight: number;
  preferredWidth?: number;
  edge?: number;
}) {
  const VIEWPORT_EDGE = input.edge ?? 8;
  const PANEL_PREFERRED_WIDTH = input.preferredWidth ?? 24 * 16;
  const { trigger, vw, vh, panelHeight } = input;
  const width = Math.min(PANEL_PREFERRED_WIDTH, vw - VIEWPORT_EDGE * 2);
  const triggerCenterX = trigger.left + trigger.width / 2;
  const alignStart = triggerCenterX < vw / 2;

  let left = alignStart ? trigger.left : trigger.right - width;
  left = Math.min(
    Math.max(VIEWPORT_EDGE, left),
    Math.max(VIEWPORT_EDGE, vw - VIEWPORT_EDGE - width),
  );

  let top = trigger.bottom + 8;
  if (panelHeight > 0) {
    const maxTop = Math.max(VIEWPORT_EDGE, vh - VIEWPORT_EDGE - panelHeight);
    if (top > maxTop) {
      const above = trigger.top - panelHeight - 8;
      top = above >= VIEWPORT_EDGE ? above : maxTop;
    }
  }

  return { top, left, width };
}

describe("notification panel viewport clamp", () => {
  it("keeps a left-half iPhone portrait panel fully on-screen", () => {
    const pos = computeNotificationPanelPos({
      trigger: { left: 94, right: 127, top: 26, bottom: 59, width: 33 },
      vw: 390,
      vh: 844,
      panelHeight: 420,
    });
    expect(pos.left).toBeGreaterThanOrEqual(8);
    expect(pos.left + pos.width).toBeLessThanOrEqual(390 - 8);
    expect(pos.top).toBeGreaterThanOrEqual(8);
    expect(pos.top + 420).toBeLessThanOrEqual(844 - 8);
  });

  it("right-aligns when the trigger is on the right half", () => {
    const pos = computeNotificationPanelPos({
      trigger: { left: 340, right: 373, top: 20, bottom: 53, width: 33 },
      vw: 390,
      vh: 844,
      panelHeight: 200,
    });
    expect(pos.left + pos.width).toBeLessThanOrEqual(390 - 8);
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
