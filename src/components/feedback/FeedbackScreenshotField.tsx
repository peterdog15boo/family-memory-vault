"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  Camera,
  ClipboardPaste,
  ImageIcon,
  Loader2,
  Trash2,
} from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import type { FeedbackScreenshot } from "@/lib/feedback/screenshot";
import {
  captureViewportScreenshot,
  screenshotFromClipboardEvent,
  screenshotFromFile,
} from "@/lib/feedback/screenshot";
import { cn } from "@/lib/utils";

type FeedbackScreenshotFieldProps = {
  value: FeedbackScreenshot | null;
  onChange: (next: FeedbackScreenshot | null) => void;
  disabled?: boolean;
  /** Called before viewport capture so the parent can hide the modal briefly. */
  onBeforeCapture?: () => void | Promise<void>;
  onAfterCapture?: () => void | Promise<void>;
};

/**
 * Paste / capture / preview screenshot for bug reports.
 */
export function FeedbackScreenshotField({
  value,
  onChange,
  disabled = false,
  onBeforeCapture,
  onAfterCapture,
}: FeedbackScreenshotFieldProps) {
  const t = useTranslations();
  const zoneId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"capture" | "paste" | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const applyScreenshot = useCallback(
    async (factory: () => Promise<FeedbackScreenshot | null>) => {
      setHint(null);
      try {
        const next = await factory();
        if (!next) {
          setHint(t("feedback.screenshotNoImage"));
          return;
        }
        onChange(next);
      } catch (error) {
        setHint(
          error instanceof Error
            ? error.message
            : t("feedback.screenshotFailed"),
        );
      }
    },
    [onChange, t],
  );

  const handlePasteEvent = useCallback(
    async (event: ClipboardEvent) => {
      if (disabled || busy) return;

      const items = event.clipboardData?.items;
      const hasImage = items
        ? Array.from(items).some((item) => item.type.startsWith("image/"))
        : false;
      if (!hasImage) return;

      const target = event.target;
      const inPasteZone =
        target instanceof HTMLElement &&
        Boolean(target.closest("[data-feedback-paste-zone]"));
      const inTextField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      // Don't steal Ctrl+V from text fields unless focus is in the paste zone.
      if (inTextField && !inPasteZone) return;

      event.preventDefault();
      setBusy("paste");
      await applyScreenshot(() => screenshotFromClipboardEvent(event));
      setBusy(null);
    },
    [applyScreenshot, busy, disabled],
  );

  useEffect(() => {
    window.addEventListener("paste", handlePasteEvent);
    return () => window.removeEventListener("paste", handlePasteEvent);
  }, [handlePasteEvent]);

  async function onCapture() {
    if (disabled || busy) return;
    setBusy("capture");
    setHint(null);
    try {
      await onBeforeCapture?.();
      // Let the modal hide paint before capturing.
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
      await new Promise((r) => setTimeout(r, 40));
      const shot = await captureViewportScreenshot();
      onChange(shot);
    } catch {
      setHint(t("feedback.screenshotCaptureFallback"));
    } finally {
      await onAfterCapture?.();
      setBusy(null);
    }
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy("paste");
    await applyScreenshot(() => screenshotFromFile(file));
    setBusy(null);
  }

  async function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    if (disabled || busy) return;
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    setBusy("paste");
    await applyScreenshot(() => screenshotFromFile(file));
    setBusy(null);
  }

  if (value) {
    return (
      <div className="ui-field">
        <div className="flex items-center justify-between gap-2">
          <span className="ui-label">{t("feedback.screenshotLabel")}</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-muted transition hover:bg-ink/5 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            onClick={() => onChange(null)}
            disabled={disabled}
            aria-label={t("feedback.screenshotRemoveAria")}
          >
            <Trash2 className="size-3.5" aria-hidden />
            {t("feedback.screenshotRemove")}
          </button>
        </div>
        <div className="mt-1.5 overflow-hidden rounded-xl border border-ink/10 bg-ink/[0.03]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value.dataUrl}
            alt={t("feedback.screenshotPreviewAlt")}
            className="max-h-48 w-full object-contain object-top"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="ui-field">
      <span className="ui-label" id={zoneId}>
        {t("feedback.screenshotLabel")}
        <span className="ml-1 font-normal text-ink-muted">
          ({t("feedback.optional")})
        </span>
      </span>
      <div
        data-feedback-paste-zone
        role="group"
        aria-labelledby={zoneId}
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "mt-1.5 rounded-xl border border-dashed px-3.5 py-3.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          dragOver
            ? "border-accent/50 bg-accent/5"
            : "border-ink/15 bg-ink/[0.02]",
          disabled && "opacity-60",
        )}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-canvas p-2 text-accent-deep shadow-sm ring-1 ring-ink/8">
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <ClipboardPaste className="size-4" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-ink">
              {t("feedback.screenshotPasteTitle")}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
              {t("feedback.screenshotPasteHint")}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <button
                type="button"
                className="ui-btn ui-btn-secondary ui-btn-sm inline-flex items-center gap-1.5"
                onClick={onCapture}
                disabled={disabled || busy !== null}
              >
                <Camera className="size-3.5" aria-hidden />
                {busy === "capture"
                  ? t("feedback.screenshotCapturing")
                  : t("feedback.screenshotCapture")}
              </button>
              <button
                type="button"
                className="ui-btn ui-btn-ghost ui-btn-sm inline-flex items-center gap-1.5"
                onClick={() => inputRef.current?.click()}
                disabled={disabled || busy !== null}
              >
                <ImageIcon className="size-3.5" aria-hidden />
                {t("feedback.screenshotBrowse")}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={onFileChange}
                tabIndex={-1}
              />
            </div>
          </div>
        </div>
      </div>
      {hint ? (
        <p className="ui-hint mt-1.5 text-amber-800/90" role="status">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
