"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import Link from "next/link";
import { Eye, X } from "lucide-react";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { useTheme } from "@/components/theme/ThemeProvider";
import {
  DESIGN_PREVIEW_BANNER_DISMISS_KEY,
  THEME_PREVIEW_SHOW_EVENT,
} from "@/lib/theme/types";

const PREVIEW_OFFSET_VAR = "--design-preview-offset";

/**
 * Sticky evaluation banner while Modern is active.
 * Clear “Modern cinematic design is active” + instant Restore Original.
 */
export function DesignPreviewBanner() {
  const { theme, restoreOriginal, ready } = useTheme();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    function syncDismissed() {
      try {
        setDismissed(
          window.localStorage.getItem(DESIGN_PREVIEW_BANNER_DISMISS_KEY) ===
            "1",
        );
      } catch {
        setDismissed(false);
      }
    }
    syncDismissed();
    window.addEventListener(THEME_PREVIEW_SHOW_EVENT, syncDismissed);
    return () =>
      window.removeEventListener(THEME_PREVIEW_SHOW_EVENT, syncDismissed);
  }, []);

  // Re-show when switching into Modern (unless user dismissed this session key).
  useEffect(() => {
    if (theme !== "modern") return;
    try {
      if (
        window.localStorage.getItem(DESIGN_PREVIEW_BANNER_DISMISS_KEY) !== "1"
      ) {
        setDismissed(false);
      }
    } catch {
      setDismissed(false);
    }
  }, [theme]);

  const visible = ready && theme === "modern" && !dismissed;

  // Offset fixed marketing nav so it never collides with this banner.
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!visible) {
      root.style.removeProperty(PREVIEW_OFFSET_VAR);
      return;
    }

    function measure() {
      const el = document.querySelector<HTMLElement>(".design-preview-banner");
      const height = el?.offsetHeight ?? 0;
      root.style.setProperty(PREVIEW_OFFSET_VAR, `${height}px`);
    }

    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      root.style.removeProperty(PREVIEW_OFFSET_VAR);
    };
  }, [visible]);

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DESIGN_PREVIEW_BANNER_DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  }

  if (!visible) return null;

  return (
    <div
      className="design-preview-banner sticky top-0 z-[55] border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)]/95 shadow-[var(--shadow-sm)] backdrop-blur-md"
      role="region"
      aria-label="Modern cinematic design preview"
    >
      <div className="mx-auto flex max-w-[72rem] flex-col gap-3 px-[var(--page-pad-x,1.25rem)] py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent-deep)]">
            <Eye className="size-3.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium tracking-tight text-[color:var(--ink)]">
              Modern cinematic design is active
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--ink-muted)]">
              Temporary visual preview on this device. Original landing, auth,
              and app styles stay intact — switch back anytime.{" "}
              <Link
                href="/settings#appearance"
                className="font-medium text-[color:var(--accent-deep)] underline-offset-2 hover:underline"
              >
                Appearance settings
              </Link>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <ThemeSwitcher compact />
          <button
            type="button"
            onClick={() => restoreOriginal()}
            className="ui-btn ui-btn-primary ui-btn-sm"
          >
            Restore Original
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex size-8 items-center justify-center rounded-[var(--ui-btn-radius)] text-[color:var(--ink-muted)] transition hover:bg-[color:var(--canvas-deep)] hover:text-[color:var(--ink)]"
            aria-label="Dismiss design preview banner"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
