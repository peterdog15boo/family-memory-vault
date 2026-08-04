"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  Camera,
  Circle,
  Loader2,
  RotateCcw,
  Square,
  Trash2,
  Video,
} from "lucide-react";
import type { LegacyVideoSectionType } from "@/lib/legacy/types";
import { LEGACY_VIDEO_SECTION_LABELS } from "@/lib/legacy/types";
import type { SerializedLegacyVideo } from "@/lib/legacy/serialize";
import { normalizeLegacyVideoContentType } from "@/lib/legacy/video-constants";

/** Soft cap for impromptu legacy messages — keeps uploads quick. */
const MAX_RECORDING_SECONDS = 120;
/** Soft client size ceiling (~2 min at modest bitrate). */
const MAX_RECORDING_BYTES = 80 * 1024 * 1024;

const MIME_CANDIDATES = [
  // Prefer MP4 when available (Safari / iOS playback).
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const;

type PermissionState =
  | "checking"
  | "needs_permission"
  | "ready"
  | "recording"
  | "preview"
  | "saving"
  | "blocked"
  | "unavailable"
  | "unsupported";

type LegacyVideoRecorderProps = {
  sectionType: LegacyVideoSectionType;
  /** Optional preloaded videos for this section. */
  initialVideos?: SerializedLegacyVideo[];
  /** Default title when saving (user can edit). */
  defaultTitle?: string;
  onSaved?: (video: SerializedLegacyVideo) => void;
  className?: string;
  /** When false, hide the saved-videos list (parent panel owns it). */
  showLibrary?: boolean;
  /** Compact chrome when nested in LegacyVideosPanel. */
  embedded?: boolean;
};

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const type of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return undefined;
}

function extensionForMime(mime: string): string {
  const base = normalizeLegacyVideoContentType(mime);
  if (base === "video/mp4") return "mp4";
  if (base === "video/quicktime") return "mov";
  return "webm";
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function isSecureMediaContext(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.isSecureContext ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

export function LegacyVideoRecorder({
  sectionType,
  initialVideos = [],
  defaultTitle,
  onSaved,
  className,
  showLibrary = true,
  embedded = false,
}: LegacyVideoRecorderProps) {
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);

  const [permission, setPermission] = useState<PermissionState>("checking");
  const [elapsed, setElapsed] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState(
    defaultTitle ?? "A message for you",
  );
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [videos, setVideos] = useState(initialVideos);
  const [pending, startTransition] = useTransition();

  const sectionLabel = LEGACY_VIDEO_SECTION_LABELS[sectionType];
  const isFarewellMessage = sectionType === "message_to_loved_ones";

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const revokePreview = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }, [previewUrl]);

  useEffect(() => {
    setVideos(initialVideos);
  }, [initialVideos]);

  useEffect(() => {
    if (!isSecureMediaContext()) {
      setPermission("unsupported");
      return;
    }
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setPermission("unsupported");
      return;
    }
    setPermission("needs_permission");
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
      stopTracks();
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  }, []);

  useEffect(() => {
    if (previewUrl && previewVideoRef.current) {
      previewVideoRef.current.src = previewUrl;
    }
  }, [previewUrl]);

  const attachLiveStream = useCallback(async (stream: MediaStream) => {
    streamRef.current = stream;
    const video = liveVideoRef.current;
    if (video) {
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Autoplay can fail until user gesture; preview still shows.
      }
    }
  }, []);

  const enableCamera = useCallback(async () => {
    setError(null);
    setSavedNote(null);
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
          video: {
            facingMode: { ideal: "user" },
            width: { ideal: 720, max: 1280 },
            height: { ideal: 720, max: 1280 },
            frameRate: { ideal: 24, max: 30 },
          },
        });
      } catch (firstErr) {
        // Some phones reject ideal constraints — fall back to basic A/V.
        const name = firstErr instanceof DOMException ? firstErr.name : "";
        if (name !== "OverconstrainedError") {
          throw firstErr;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { facingMode: "user" },
        });
      }
      await attachLiveStream(stream);
      setPermission("ready");
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setPermission("blocked");
        setError(
          "Camera or microphone access was blocked. You can allow access in your browser settings and try again, or upload a video instead.",
        );
      } else if (
        name === "NotFoundError" ||
        name === "DevicesNotFoundError" ||
        name === "OverconstrainedError"
      ) {
        setPermission("unavailable");
        setError(
          "We couldn’t find a camera or microphone on this device. You can still upload a pre-recorded video.",
        );
      } else {
        setPermission("unavailable");
        setError(
          err instanceof Error
            ? err.message
            : "We couldn’t open your camera right now. Try uploading a video instead.",
        );
      }
    }
  }, [attachLiveStream]);

  const resetRecording = useCallback(async () => {
    clearTimer();
    setElapsed(0);
    setRecordedBlob(null);
    revokePreview();
    setError(null);
    setSavedNote(null);
    if (!streamRef.current) {
      setPermission("needs_permission");
      return;
    }
    setPermission("ready");
    if (liveVideoRef.current && streamRef.current) {
      liveVideoRef.current.srcObject = streamRef.current;
      try {
        await liveVideoRef.current.play();
      } catch {
        // ignore
      }
    }
  }, [clearTimer, revokePreview]);

  const stopRecording = useCallback(() => {
    clearTimer();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, [clearTimer]);

  const startRecording = useCallback(() => {
    setError(null);
    setSavedNote(null);
    const stream = streamRef.current;
    if (!stream) {
      setError("Turn on your camera first.");
      return;
    }

    const mimeType = pickRecorderMimeType();
    chunksRef.current = [];

    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, {
            mimeType,
            videoBitsPerSecond: 1_200_000,
            audioBitsPerSecond: 96_000,
          })
        : new MediaRecorder(stream, {
            videoBitsPerSecond: 1_200_000,
            audioBitsPerSecond: 96_000,
          });
    } catch {
      setError("This browser couldn’t start a video recording.");
      setPermission("unsupported");
      return;
    }

    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.onerror = () => {
      setError("Recording stopped unexpectedly. Please try again.");
      clearTimer();
      setPermission("ready");
    };
    recorder.onstop = () => {
      clearTimer();
      const type =
        recorder.mimeType || mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      if (blob.size <= 0) {
        setError("That recording was empty. Please try again.");
        setPermission("ready");
        return;
      }
      if (blob.size > MAX_RECORDING_BYTES) {
        setError(
          "That clip is a bit large. Try a shorter message — about two minutes is plenty.",
        );
        setPermission("ready");
        return;
      }
      const url = URL.createObjectURL(blob);
      setRecordedBlob(blob);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setPermission("preview");
    };

    startedAtRef.current = Date.now();
    setElapsed(0);
    recorder.start(1000);
    setPermission("recording");

    timerRef.current = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(seconds);
      if (seconds >= MAX_RECORDING_SECONDS) {
        stopRecording();
      }
    }, 250);
  }, [clearTimer, stopRecording]);

  const saveRecording = useCallback(async () => {
    if (!recordedBlob) return;
    setPermission("saving");
    setError(null);
    setSavedNote(null);

    const mime = normalizeLegacyVideoContentType(
      recordedBlob.type || "video/webm",
    );
    const ext = extensionForMime(mime);
    const filename = `legacy-message-${Date.now()}.${ext}`;
    const durationSeconds = Math.max(1, elapsed);

    try {
      const urlRes = await fetch("/api/legacy/videos/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename,
          contentType: mime,
          size: recordedBlob.size,
        }),
      });
      const urlData = (await urlRes.json().catch(() => ({}))) as {
        error?: string;
        uploadUrl?: string;
        key?: string;
        contentType?: string;
      };
      if (!urlRes.ok || !urlData.uploadUrl || !urlData.key) {
        throw new Error(urlData.error || "Could not prepare the upload.");
      }

      const putRes = await fetch(urlData.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": urlData.contentType || mime,
        },
        body: recordedBlob,
      });
      if (!putRes.ok) {
        throw new Error("Upload failed. Please try again.");
      }

      const completeRes = await fetch("/api/legacy/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tempKey: urlData.key,
          filename,
          contentType: urlData.contentType || mime,
          size: recordedBlob.size,
          sectionType,
          title: title.trim() || "A message for you",
          sourceType: "recorded",
          durationSeconds,
        }),
      });
      const completeData = (await completeRes.json().catch(() => ({}))) as {
        error?: string;
        video?: SerializedLegacyVideo;
      };
      if (!completeRes.ok || !completeData.video) {
        throw new Error(completeData.error || "Could not save your message.");
      }

      const saved = completeData.video;
      setVideos((prev) => [...prev, saved]);
      onSaved?.(saved);
      setSavedNote("Saved privately in your Digital Legacy vault.");
      stopTracks();
      clearTimer();
      setRecordedBlob(null);
      revokePreview();
      setElapsed(0);
      setPermission("needs_permission");
    } catch (err) {
      setPermission("preview");
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while saving. Please try again.",
      );
    }
  }, [
    clearTimer,
    elapsed,
    onSaved,
    recordedBlob,
    revokePreview,
    sectionType,
    stopTracks,
    title,
  ]);

  const deleteSaved = useCallback(
    (video: SerializedLegacyVideo) => {
      const ok = window.confirm(
        `Remove “${video.title}”? This can’t be undone.`,
      );
      if (!ok) return;
      startTransition(async () => {
        setError(null);
        try {
          const res = await fetch(`/api/legacy/videos/${video.id}`, {
            method: "DELETE",
          });
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          if (!res.ok) {
            throw new Error(data.error || "Could not remove that video.");
          }
          setVideos((prev) => prev.filter((row) => row.id !== video.id));
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Could not remove that video.",
          );
        }
      });
    },
    [],
  );

  const remaining = Math.max(0, MAX_RECORDING_SECONDS - elapsed);

  return (
    <section
      className={
        className ??
        (embedded
          ? "space-y-5"
          : "legacy-vault-panel documents-vault-panel legacy-vault-in space-y-5 rounded-2xl p-5 sm:p-6")
      }
    >
      {!embedded ? (
        <div>
          <h2 className="font-display text-xl tracking-tight text-[color:var(--legacy-ink)]">
            {isFarewellMessage
              ? "Record a short message"
              : "Record a personal message"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--legacy-muted)]">
            {isFarewellMessage
              ? "A minute or two is often enough. Speak as if they’re sitting with you — warmth matters more than polish."
              : `Speak from the heart. A short video can sit beside your written words in ${sectionLabel.toLowerCase()} — private to your vault.`}
          </p>
        </div>
      ) : isFarewellMessage ? (
        <p className="text-xs leading-relaxed text-[color:var(--legacy-muted)]">
          Soft tip: if you go past two minutes, that’s fine — but shorter is
          often easier for them to revisit when emotions are high.
        </p>
      ) : null}

      {permission === "checking" ? (
        <p className="text-sm text-[color:var(--legacy-muted)]">
          Checking camera support…
        </p>
      ) : null}

      {permission === "unsupported" ? (
        <div className="space-y-2 rounded-xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-accent-soft)]/40 px-4 py-3 text-sm text-[color:var(--legacy-ink)]">
          <p>
            In-browser recording isn’t available here. Try Chrome or Safari on a
            phone or computer with a camera, using HTTPS.
          </p>
          <p className="text-[color:var(--legacy-muted)]">
            You can still add a pre-recorded MP4 or MOV from your device using
            Upload.
          </p>
        </div>
      ) : null}

      {permission === "blocked" ? (
        <div className="space-y-3 rounded-xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-accent-soft)]/30 px-4 py-3">
          <p className="text-sm leading-relaxed text-[color:var(--legacy-ink)]">
            Camera or microphone access is blocked for this site. On a phone,
            check the browser’s site settings (or iOS Settings → Safari → Camera
            / Microphone) and allow both, then try again.
          </p>
          <p className="text-sm text-[color:var(--legacy-muted)]">
            Prefer not to use the camera? Upload a short video you already
            recorded instead.
          </p>
          <button
            type="button"
            onClick={() => void enableCamera()}
            className="inline-flex items-center gap-2 rounded-md border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm font-medium text-[color:var(--legacy-ink)] hover:bg-white"
          >
            <Camera className="size-4" aria-hidden />
            Try again
          </button>
        </div>
      ) : null}

      {permission === "unavailable" ? (
        <div className="space-y-3 rounded-xl border border-[color:var(--legacy-line)] bg-[color:var(--legacy-accent-soft)]/30 px-4 py-3">
          <p className="text-sm leading-relaxed text-[color:var(--legacy-ink)]">
            We couldn’t reach a camera or microphone on this device. Close other
            apps that might be using them, or try a different browser.
          </p>
          <p className="text-sm text-[color:var(--legacy-muted)]">
            You can still upload a pre-recorded video into this section.
          </p>
          <button
            type="button"
            onClick={() => void enableCamera()}
            className="inline-flex items-center gap-2 rounded-md border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm font-medium text-[color:var(--legacy-ink)] hover:bg-white"
          >
            <Camera className="size-4" aria-hidden />
            Try again
          </button>
        </div>
      ) : null}

      {permission === "needs_permission" ? (
        <button
          type="button"
          onClick={() => void enableCamera()}
          className="inline-flex items-center gap-2 rounded-md bg-[color:var(--legacy-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[color:var(--legacy-accent-deep)]"
        >
          <Camera className="size-4" aria-hidden />
          Use camera
        </button>
      ) : null}

      {(permission === "ready" || permission === "recording") && (
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-xl bg-black/90 aspect-[3/4] sm:aspect-video">
            <video
              ref={liveVideoRef}
              muted
              playsInline
              autoPlay
              className="h-full w-full object-cover"
            />
            {permission === "recording" ? (
              <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-red-600/90 px-3 py-1 text-xs font-medium text-white">
                <span className="size-2 animate-pulse rounded-full bg-white" />
                Recording {formatDuration(elapsed)}
                <span className="opacity-80">· {formatDuration(remaining)} left</span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {permission === "ready" ? (
              <button
                type="button"
                onClick={startRecording}
                className="inline-flex items-center gap-2 rounded-md bg-[color:var(--legacy-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[color:var(--legacy-accent-deep)]"
              >
                <Circle className="size-4 fill-current" aria-hidden />
                Start recording
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="inline-flex items-center gap-2 rounded-md bg-red-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-800"
              >
                <Square className="size-4 fill-current" aria-hidden />
                Stop
              </button>
            )}
            <p className="text-xs text-[color:var(--legacy-muted)]">
              Aim for a short message — up to about two minutes.
            </p>
          </div>
        </div>
      )}

      {(permission === "preview" || permission === "saving") && previewUrl ? (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl bg-black/90 aspect-[3/4] sm:aspect-video">
            <video
              ref={previewVideoRef}
              controls
              playsInline
              className="h-full w-full object-contain"
            />
          </div>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--legacy-muted)]">
              Title
            </span>
            <input
              type="text"
              value={title}
              maxLength={200}
              disabled={permission === "saving"}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--legacy-accent)]"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={permission === "saving"}
              onClick={() => void saveRecording()}
              className="inline-flex items-center gap-2 rounded-md bg-[color:var(--legacy-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[color:var(--legacy-accent-deep)] disabled:opacity-50"
            >
              {permission === "saving" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Video className="size-4" aria-hidden />
              )}
              {permission === "saving" ? "Saving…" : "Save to Digital Legacy"}
            </button>
            <button
              type="button"
              disabled={permission === "saving"}
              onClick={() => void resetRecording()}
              className="inline-flex items-center gap-2 rounded-md border border-[color:var(--legacy-line)] bg-white/70 px-3 py-2.5 text-sm font-medium text-[color:var(--legacy-ink)] hover:bg-white disabled:opacity-50"
            >
              <RotateCcw className="size-4" aria-hidden />
              Re-record
            </button>
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

      {showLibrary && videos.length > 0 ? (
        <div className="border-t border-[color:var(--legacy-line)] pt-5">
          <h3 className="text-sm font-medium text-[color:var(--legacy-ink)]">
            Saved videos
          </h3>
          <ul className="mt-3 space-y-2">
            {videos.map((video) => (
              <li
                key={video.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-[color:var(--legacy-line)] bg-white/50 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[color:var(--legacy-ink)]">
                    {video.title}
                  </p>
                  <p className="text-xs text-[color:var(--legacy-muted)]">
                    {video.sourceType === "recorded" ? "Recorded" : "Uploaded"}
                    {video.durationSeconds
                      ? ` · ${formatDuration(video.durationSeconds)}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => deleteSaved(video)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50 disabled:opacity-50"
                  aria-label={`Remove ${video.title}`}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
