"use client";

import { useCallback, useEffect } from "react";

type UseLightboxKeyboardNavOptions = {
  open: boolean;
  /** Ordered ids of items in the lightbox set. */
  itemIds: string[];
  activeId: string | null;
  onActiveIdChange: (id: string) => void;
  /** When false, skip arrow handling (e.g. nested dialog). Default true. */
  enabled?: boolean;
};

/**
 * ArrowLeft / ArrowRight cycle the active lightbox item when more than one
 * exists. Escape / Tab remain handled by useOverlayA11y.
 */
export function useLightboxKeyboardNav({
  open,
  itemIds,
  activeId,
  onActiveIdChange,
  enabled = true,
}: UseLightboxKeyboardNavOptions) {
  const goRelative = useCallback(
    (delta: number) => {
      if (itemIds.length < 2 || !activeId) return;
      const index = itemIds.indexOf(activeId);
      if (index < 0) return;
      const next =
        itemIds[(index + delta + itemIds.length) % itemIds.length] ?? null;
      if (next) onActiveIdChange(next);
    },
    [activeId, itemIds, onActiveIdChange],
  );

  useEffect(() => {
    if (!open || !enabled || itemIds.length < 2) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      // Defer to nested tag editors / text fields (caret or smart nav).
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goRelative(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goRelative(-1);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, enabled, itemIds.length, goRelative]);

  const index = activeId ? itemIds.indexOf(activeId) : -1;

  return {
    canNavigate: itemIds.length >= 2,
    index: index >= 0 ? index : 0,
    count: itemIds.length,
    goPrev: () => goRelative(-1),
    goNext: () => goRelative(1),
  };
}
