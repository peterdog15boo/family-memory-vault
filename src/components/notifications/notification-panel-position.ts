/**
 * Viewport clamp for the header Notifications popover.
 * Kept pure so unit tests can cover iPhone portrait/landscape without a browser.
 */

/** Preferred panel width on desktop (matches former sm:w-96). */
export const NOTIFICATION_PANEL_PREFERRED_WIDTH = 24 * 16;
export const NOTIFICATION_VIEWPORT_EDGE = 8;

/**
 * Match dashboard compact chrome: phone portrait OR short landscape under lg.
 * Full-width sheet under the header on these viewports.
 */
export function isNotificationNarrowViewport(vw: number, vh: number): boolean {
  // Mirrors SHELL_COMPACT_CHROME_MQ: (max-width: 1023px) and
  // ((max-width: 639px) or (max-height: 500px)).
  return vw <= 1023 && (vw <= 639 || vh <= 500);
}

export type NotificationTriggerRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
};

export type NotificationPanelPos = {
  top: number;
  left: number;
  width: number;
};

export function computeNotificationPanelPos(input: {
  trigger: NotificationTriggerRect;
  vw: number;
  vh: number;
  panelHeight: number;
  preferredWidth?: number;
  edge?: number;
}): NotificationPanelPos {
  const VIEWPORT_EDGE = input.edge ?? NOTIFICATION_VIEWPORT_EDGE;
  const PANEL_PREFERRED_WIDTH =
    input.preferredWidth ?? NOTIFICATION_PANEL_PREFERRED_WIDTH;
  const { trigger, vw, vh, panelHeight } = input;

  const narrow = isNotificationNarrowViewport(vw, vh);
  const width = narrow
    ? Math.max(0, vw - VIEWPORT_EDGE * 2)
    : Math.min(PANEL_PREFERRED_WIDTH, vw - VIEWPORT_EDGE * 2);

  let left: number;
  if (narrow) {
    // Phone portrait + landscape: full-width card under the header — never
    // clipped off the left/right edge.
    left = VIEWPORT_EDGE;
  } else {
    // Desktop: anchor under the bell, prefer right-align when the trigger is
    // on the right half (typical header placement).
    const triggerCenterX = trigger.left + trigger.width / 2;
    const alignStart = triggerCenterX < vw / 2;
    left = alignStart ? trigger.left : trigger.right - width;
    left = Math.min(
      Math.max(VIEWPORT_EDGE, left),
      Math.max(VIEWPORT_EDGE, vw - VIEWPORT_EDGE - width),
    );
  }

  let top = trigger.bottom + 8;
  if (panelHeight > 0) {
    const maxTop = Math.max(
      VIEWPORT_EDGE,
      vh - VIEWPORT_EDGE - panelHeight,
    );
    if (top > maxTop) {
      const above = trigger.top - panelHeight - 8;
      top = above >= VIEWPORT_EDGE ? above : maxTop;
    }
  }

  return { top, left, width };
}
