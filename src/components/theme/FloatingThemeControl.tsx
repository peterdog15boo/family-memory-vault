"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Palette, X } from "lucide-react";
import { ThemeSwitcher } from "@/components/theme/ThemeSwitcher";
import { useTheme } from "@/components/theme/ThemeProvider";
import {
  APP_THEME_LABELS,
  THEME_FLOATER_DISMISS_KEY,
  THEME_PREVIEW_SHOW_EVENT,
} from "@/lib/theme/types";

/**
 * Temporary floating Design Preview control for evaluating Original vs Modern.
 * Dismissible; Settings remains the permanent control.
 */
export function FloatingThemeControl() {
  const { theme, restoreOriginal, ready, isModern } = useTheme();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    function syncHidden() {
      try {
        setHidden(window.localStorage.getItem(THEME_FLOATER_DISMISS_KEY) === "1");
      } catch {
        setHidden(false);
      }
    }

    function onPreviewShow() {
      syncHidden();
      setOpen(true);
    }

    syncHidden();
    window.addEventListener(THEME_PREVIEW_SHOW_EVENT, onPreviewShow);
    return () =>
      window.removeEventListener(THEME_PREVIEW_SHOW_EVENT, onPreviewShow);
  }, []);

  // Keep the panel open when entering Modern so restore is one click away.
  useEffect(() => {
    if (isModern && !hidden) setOpen(true);
  }, [isModern, hidden]);

  function dismiss() {
    setOpen(false);
    setHidden(true);
    try {
      window.localStorage.setItem(THEME_FLOATER_DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  }

  if (hidden) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-2">
      {open ? (
        <div className="pointer-events-auto w-[min(100vw-2rem,19.5rem)] rounded-[var(--radius-xl)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] p-3.5 shadow-[var(--shadow-lg)] backdrop-blur-md">
          <div className="mb-2.5 flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--ink-muted)]">
                Design Preview
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--ink-muted)]">
                {isModern
                  ? "Modern cinematic design is active. Original stays available."
                  : "Compare looks safely. Choice saves on this device."}
              </p>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-md p-1 text-[color:var(--ink-muted)] hover:bg-[color:var(--canvas-deep)] hover:text-[color:var(--ink)]"
              aria-label="Dismiss design preview"
            >
              <X className="size-3.5" />
            </button>
          </div>

          <ThemeSwitcher compact />

          <div className="mt-3 flex flex-col gap-2">
            <p className="text-[11px] text-[color:var(--ink-muted)]">
              Active:{" "}
              <span className="font-medium text-[color:var(--ink)]">
                {APP_THEME_LABELS[theme]}
              </span>
            </p>
            {isModern ? (
              <button
                type="button"
                disabled={!ready}
                onClick={() => restoreOriginal()}
                className="ui-btn ui-btn-primary ui-btn-sm w-full"
              >
                Restore Original
              </button>
            ) : null}
            <Link
              href="/settings#appearance"
              className="text-center text-[11px] font-medium text-[color:var(--accent-deep)] underline-offset-2 hover:underline"
              onClick={() => setOpen(false)}
            >
              Open Appearance settings
            </Link>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)] px-3.5 py-2 text-sm font-medium text-[color:var(--ink)] shadow-[var(--shadow-md)] transition hover:border-[color:var(--accent)]/40"
        aria-expanded={open}
        aria-label="Open design preview theme switcher"
      >
        <Palette className="size-4 text-[color:var(--accent-deep)]" aria-hidden />
        {isModern ? "Modern design" : "Design Preview"}
      </button>
    </div>
  );
}
