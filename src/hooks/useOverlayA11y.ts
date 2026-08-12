"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(", ");

/** LIFO stack so nested overlays only the topmost handles Escape / Tab trap. */
const overlayStack: symbol[] = [];

export function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => {
      if (el.hasAttribute("disabled") || el.getAttribute("aria-hidden") === "true") {
        return false;
      }
      if (el.tabIndex < 0) return false;
      let node: HTMLElement | null = el;
      while (node && node !== root) {
        if (node.getAttribute("aria-hidden") === "true") return false;
        node = node.parentElement;
      }
      return true;
    },
  );
}

export type UseOverlayA11yOptions = {
  open: boolean;
  onClose: () => void;
  containerRef: RefObject<HTMLElement | null>;
  /** When false, Escape does nothing (e.g. submitting). Default true. */
  escapeEnabled?: boolean;
  /** Cycle Tab within the container. Default true. */
  trapFocus?: boolean;
  /** Return focus to the previously focused element on close. Default true. */
  restoreFocus?: boolean;
  /** Set body overflow hidden while open. Default true. */
  lockScroll?: boolean;
  /** Pad body for scrollbar width when locking scroll. Default false. */
  lockScrollPadding?: boolean;
  /**
   * Where to move focus on open.
   * - `"first"` — first focusable (default)
   * - `"container"` — container itself (must be focusable, e.g. tabIndex={-1})
   * - ref — specific element
   */
  initialFocus?: "first" | "container" | RefObject<HTMLElement | null>;
  /** Prefer this selector inside the container before falling back to initialFocus. */
  initialFocusSelector?: string;
};

/**
 * Escape to close, Tab focus trap, optional scroll lock, and restore focus
 * to the trigger when an overlay closes. Minimal visual impact.
 */
export function useOverlayA11y({
  open,
  onClose,
  containerRef,
  escapeEnabled = true,
  trapFocus = true,
  restoreFocus = true,
  lockScroll = true,
  lockScrollPadding = false,
  initialFocus = "first",
  initialFocusSelector,
}: UseOverlayA11yOptions) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const escapeEnabledRef = useRef(escapeEnabled);
  escapeEnabledRef.current = escapeEnabled;
  const trapFocusRef = useRef(trapFocus);
  trapFocusRef.current = trapFocus;
  const idRef = useRef<symbol | null>(null);
  if (idRef.current === null) idRef.current = Symbol("overlay");

  useEffect(() => {
    if (!open) return;

    const id = idRef.current!;
    overlayStack.push(id);

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    let prevOverflow = "";
    let prevPaddingRight = "";
    if (lockScroll) {
      prevOverflow = document.body.style.overflow;
      prevPaddingRight = document.body.style.paddingRight;
      document.body.style.overflow = "hidden";
      if (lockScrollPadding) {
        const gap = window.innerWidth - document.documentElement.clientWidth;
        if (gap > 0) {
          document.body.style.paddingRight = `${gap}px`;
        }
      }
    }

    const focusTimer = window.setTimeout(() => {
      const root = containerRef.current;
      if (!root) return;

      if (initialFocusSelector) {
        const preferred = root.querySelector<HTMLElement>(initialFocusSelector);
        if (preferred) {
          preferred.focus({ preventScroll: true });
          return;
        }
      }

      if (initialFocus === "container") {
        root.focus({ preventScroll: true });
        return;
      }

      if (initialFocus !== "first" && initialFocus?.current) {
        initialFocus.current.focus({ preventScroll: true });
        return;
      }

      const focusable = getFocusableElements(root);
      if (focusable.length > 0) {
        focusable[0].focus({ preventScroll: true });
      } else {
        root.focus({ preventScroll: true });
      }
    }, 0);

    function isTopOverlay() {
      return overlayStack[overlayStack.length - 1] === id;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!isTopOverlay()) return;

      if (event.key === "Escape") {
        if (!escapeEnabledRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (!trapFocusRef.current || event.key !== "Tab") return;
      const root = containerRef.current;
      if (!root) return;

      const focusable = getFocusableElements(root);
      if (focusable.length === 0) {
        event.preventDefault();
        root.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (active instanceof Node && active !== root && !root.contains(active)) {
        return;
      }

      if (event.shiftKey) {
        if (active === first || active === root) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      const idx = overlayStack.lastIndexOf(id);
      if (idx >= 0) overlayStack.splice(idx, 1);
      if (lockScroll) {
        document.body.style.overflow = prevOverflow;
        if (lockScrollPadding) {
          document.body.style.paddingRight = prevPaddingRight;
        }
      }
      if (restoreFocus && previouslyFocused) {
        window.requestAnimationFrame(() => {
          if (
            previouslyFocused.isConnected &&
            typeof previouslyFocused.focus === "function"
          ) {
            previouslyFocused.focus({ preventScroll: true });
          }
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    restoreFocus,
    lockScroll,
    lockScrollPadding,
    initialFocusSelector,
    initialFocus === "first" || initialFocus === "container"
      ? initialFocus
      : true,
  ]);
}
