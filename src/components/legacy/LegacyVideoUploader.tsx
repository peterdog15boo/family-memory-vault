"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { FileVideo, Loader2, Upload } from "lucide-react";
import { formatBytes } from "@/lib/billing/quotas";
import type { SerializedLegacyVideo } from "@/lib/legacy/serialize";
import type { LegacyVideoSectionType } from "@/lib/legacy/types";
import { LEGACY_VIDEO_SECTION_LABELS } from "@/lib/legacy/types";
import {
  contentTypeForLegacyVideoFilename,
  isAllowedLegacyVideoContentType,
  LEGACY_VIDEO_MAX_BYTES,
  normalizeLegacyVideoContentType,
} from "@/lib/legacy/video-constants";
import { beginUploadActivity } from "@/lib/session/upload-activity";

const ACCEPT = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
  ".mp4",
  ".m4v",
  ".webm",
  ".mov",
  ".mkv",
].join(",");

type Phase = "form" | "uploading" | "saving";

type LegacyVideoUploaderProps = {
  sectionType: LegacyVideoSectionType;
  /** When set, user can switch which section receives the upload. */
  sectionOptions?: LegacyVideoSectionType[];
  onUploaded?: (video: SerializedLegacyVideo) => void;
  className?: string;
  /** Compact panel without outer vault chrome (when nested). */
  embedded?: boolean;
  /** Prefill title (e.g. suggested walkthrough name). */
  defaultTitle?: string;
};

function guessContentType(file: File): string {
  const fromType = normalizeLegacyVideoContentType(file.type || "");
  if (fromType && isAllowedLegacyVideoContentType(fromType)) return fromType;
  return contentTypeForLegacyVideoFilename(file.name) ?? fromType;
}

function titleFromFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  return base.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || "Video";
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function readVideoDurationSeconds(file: File): Promise<number | null> {
  if (typeof document === "undefined") return null;
  const url = URL.createObjectURL(file);
  try {
    const duration = await new Promise<number | null>((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      const finish = (value: number | null) => {
        video.removeAttribute("src");
        video.load();
        resolve(value);
      };
      video.onloadedmetadata = () => {
        const d = video.duration;
        if (Number.isFinite(d) && d > 0) finish(Math.round(d));
        else finish(null);
      };
      video.onerror = () => finish(null);
      window.setTimeout(() => finish(null), 8_000);
      video.src = url;
    });
    return duration;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function putWithProgress(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        onProgress(Math.round((ev.loaded / ev.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("Upload to storage failed."));
    };
    xhr.onerror = () => reject(new Error("Upload to storage failed."));
    xhr.send(file);
  });
}

export function LegacyVideoUploader({
  sectionType: initialSectionType,
  sectionOptions,
  onUploaded,
  className,
  embedded = false,
  defaultTitle,
}: LegacyVideoUploaderProps) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [sectionType, setSectionType] =
    useState<LegacyVideoSectionType>(initialSectionType);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(defaultTitle?.trim() || "");
  const [description, setDescription] = useState("");
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const sectionLabel = LEGACY_VIDEO_SECTION_LABELS[sectionType];
  const isFarewellMessage = sectionType === "message_to_loved_ones";
  const options = sectionOptions?.length
    ? sectionOptions
    : ([initialSectionType] as LegacyVideoSectionType[]);
  const showSectionPicker = options.length > 1;
  const busy = phase === "uploading" || phase === "saving";

  useEffect(() => {
    if (defaultTitle?.trim()) {
      setTitle((prev) => (prev.trim() ? prev : defaultTitle.trim()));
    }
  }, [defaultTitle]);

  const resetFormForAnother = useCallback(() => {
    setFile(null);
    setTitle(defaultTitle?.trim() || "");
    setDescription("");
    setDurationSeconds(null);
    setPhase("form");
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [defaultTitle]);

  async function handleFileChange(next: File | null) {
    setError(null);
    setSavedNote(null);
    setDurationSeconds(null);
    if (!next) {
      setFile(null);
      return;
    }

    const contentType = guessContentType(next);
    if (!contentType || !isAllowedLegacyVideoContentType(contentType)) {
      setError(
        "That format isn’t supported. Try MP4, WebM, or QuickTime (.mov).",
      );
      setFile(null);
      return;
    }
    if (next.size > LEGACY_VIDEO_MAX_BYTES) {
      setError(
        `That file is too large (max ${formatBytes(LEGACY_VIDEO_MAX_BYTES)}).`,
      );
      setFile(null);
      return;
    }

    setFile(next);
    setTitle((prev) => prev.trim() || titleFromFilename(next.name));
    const duration = await readVideoDurationSeconds(next);
    setDurationSeconds(duration);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Choose a video to upload.");
      return;
    }
    const contentType = guessContentType(file);
    if (!contentType || !isAllowedLegacyVideoContentType(contentType)) {
      setError(
        "That format isn’t supported. Try MP4, WebM, or QuickTime (.mov).",
      );
      return;
    }
    if (!title.trim()) {
      setError("Add a short title for this video.");
      return;
    }

    setError(null);
    setSavedNote(null);
    setPhase("uploading");
    setProgress(0);

    const endUpload = beginUploadActivity();
    try {
      const presignRes = await fetch("/api/legacy/videos/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType,
          size: file.size,
        }),
      });
      const presign = (await presignRes.json().catch(() => ({}))) as {
        error?: string;
        uploadUrl?: string;
        key?: string;
        contentType?: string;
      };
      if (!presignRes.ok || !presign.uploadUrl || !presign.key) {
        throw new Error(presign.error || "Could not prepare the upload.");
      }

      await putWithProgress(
        presign.uploadUrl,
        file,
        presign.contentType || contentType,
        setProgress,
      );

      setPhase("saving");
      const completeRes = await fetch("/api/legacy/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tempKey: presign.key,
          filename: file.name,
          contentType: presign.contentType || contentType,
          size: file.size,
          sectionType,
          title: title.trim(),
          description: description.trim() || null,
          sourceType: "uploaded",
          durationSeconds,
        }),
      });
      const complete = (await completeRes.json().catch(() => ({}))) as {
        error?: string;
        video?: SerializedLegacyVideo;
      };
      if (!completeRes.ok || !complete.video) {
        throw new Error(complete.error || "Could not save your video.");
      }

      onUploaded?.(complete.video);
      setSavedNote(
        isFarewellMessage
          ? "Saved privately in your farewell packet. You can add another message anytime."
          : "Saved privately. You can upload another video to this section anytime.",
      );
      resetFormForAnother();
    } catch (err) {
      setPhase("form");
      setProgress(0);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while uploading. Please try again.",
      );
    } finally {
      endUpload();
    }
  }

  const panelClass =
    className ??
    (embedded
      ? "space-y-5"
      : "legacy-vault-panel documents-vault-panel legacy-vault-in space-y-5 rounded-2xl p-5 sm:p-6");

  return (
    <section className={panelClass}>
      {!embedded ? (
        <div>
          <h2 className="font-display text-xl tracking-tight text-[color:var(--legacy-ink)]">
            {isFarewellMessage ? "Add a video you already made" : "Upload a video"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--legacy-muted)]">
            {isFarewellMessage
              ? "If you already recorded something elsewhere — a toast, a quiet talk, a birthday clip — you can include it here as part of your farewell."
              : `Add a clip you already recorded — a toast, a story, or a quiet note — into ${sectionLabel.toLowerCase()}.`}
          </p>
        </div>
      ) : null}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {showSectionPicker ? (
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--legacy-muted)]">
              Section
            </span>
            <select
              value={sectionType}
              disabled={busy}
              onChange={(e) =>
                setSectionType(e.target.value as LegacyVideoSectionType)
              }
              className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
            >
              {options.map((option) => (
                <option key={option} value={option}>
                  {LEGACY_VIDEO_SECTION_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div>
          <label
            htmlFor={inputId}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[color:var(--legacy-line)] bg-white/50 px-4 py-8 text-center transition hover:border-[color:var(--legacy-accent)] hover:bg-white/80"
          >
            <FileVideo
              className="size-8 text-[color:var(--legacy-accent)]"
              aria-hidden
            />
            <span className="text-sm font-medium text-[color:var(--legacy-ink)]">
              {file ? "Choose a different video" : "Choose a video file"}
            </span>
            <span className="text-xs text-[color:var(--legacy-muted)]">
              MP4 preferred for phones · WebM or MOV also ok · up to{" "}
              {formatBytes(LEGACY_VIDEO_MAX_BYTES)}
            </span>
          </label>
          <input
            ref={fileInputRef}
            id={inputId}
            type="file"
            accept={ACCEPT}
            disabled={busy}
            className="sr-only"
            onChange={(e) => {
              void handleFileChange(e.target.files?.[0] ?? null);
            }}
          />
        </div>

        {file ? (
          <div className="rounded-lg border border-[color:var(--legacy-line)] bg-white/60 px-3 py-2.5 text-sm text-[color:var(--legacy-ink)]">
            <p className="font-medium truncate">{file.name}</p>
            <p className="mt-0.5 text-xs text-[color:var(--legacy-muted)]">
              {formatBytes(file.size)}
              {durationSeconds != null
                ? ` · ${formatDuration(durationSeconds)}`
                : ""}
            </p>
          </div>
        ) : null}

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--legacy-muted)]">
            Title
          </span>
          <input
            type="text"
            value={title}
            maxLength={200}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="A short name for this clip"
            className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--legacy-muted)]">
            Description{" "}
            <span className="normal-case tracking-normal">(optional)</span>
          </span>
          <textarea
            value={description}
            maxLength={4000}
            rows={3}
            disabled={busy}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A note about when this was filmed, or who it’s for."
            className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2.5 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
          />
        </label>

        {phase === "uploading" || phase === "saving" ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-[color:var(--legacy-muted)]">
              <span>
                {phase === "uploading" ? "Uploading…" : "Saving to your vault…"}
              </span>
              {phase === "uploading" ? <span>{progress}%</span> : null}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--legacy-line)]">
              <div
                className="h-full rounded-full bg-[color:var(--legacy-accent)] transition-all"
                style={{
                  width: `${phase === "saving" ? 100 : progress}%`,
                }}
              />
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-red-800" role="alert">
            {error}
          </p>
        ) : null}
        {savedNote ? (
          <p className="text-sm text-[color:var(--legacy-accent-deep)]">
            {savedNote}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy || !file}
          className="inline-flex items-center gap-2 rounded-md bg-[color:var(--legacy-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[color:var(--legacy-accent-deep)] disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Upload className="size-4" aria-hidden />
          )}
          {phase === "uploading"
            ? "Uploading…"
            : phase === "saving"
              ? "Saving…"
              : "Save to Digital Legacy"}
        </button>
      </form>
    </section>
  );
}
