"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  Images,
} from "lucide-react";
import { UpgradePrompt } from "@/components/billing/UpgradePrompt";
import { userFacingApiError } from "@/lib/http/user-messages";
import { sha256HexFromFile } from "@/lib/media/import/content-hash-client";
import {
  FFM_SOFT_MIN_PHOTOS,
  getGuidedUploadProgressCopy,
  getProcessingMicroCopy,
  isImageFile,
} from "@/lib/first-family-movie/guided-upload";
import {
  MAX_IMAGE_BYTES,
  canProxyUploadBytes,
  formatUploadLimit,
} from "@/lib/upload/constants";
import { prepareUploadFile } from "@/lib/upload/prepare-upload-file";
import { beginUploadActivity } from "@/lib/session/upload-activity";
import { announce } from "@/lib/a11y/announce";
import { trackFirstMovieEvent } from "@/lib/first-family-movie/track-client";
import { cn } from "@/lib/utils";

type UploadPhase =
  | "queued"
  | "uploading"
  | "processing"
  | "ready"
  | "error";

type GuidedItem = {
  id: string;
  file: File;
  previewUrl: string;
  phase: UploadPhase;
  progress: number;
  error?: string;
  mediaId?: string;
};

type Props = {
  storageBlocked?: boolean;
  planName?: string;
  /** Photos already accepted in this ritual (e.g. after “Add more”). */
  initialMediaIds?: string[];
  onBack: () => void;
  onContinue: (mediaIds: string[]) => void;
  onSkip?: () => void;
  skipPending?: boolean;
};

const DIRECT_UPLOAD_REQUIRED_MESSAGE =
  "This file is too large for the backup upload path. Try a smaller photo, or confirm storage CORS is configured.";

function isLikelyCorsOrNetworkUploadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  if (/\(404\)/.test(error.message)) return true;
  return (
    msg.includes("network error while uploading to storage") ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    /\(403\)/.test(error.message) ||
    /\(405\)/.test(error.message)
  );
}

function uploadFailureMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Upload failed.";
  if (/\(413\)/.test(error.message)) {
    return "That photo is too large to upload right now. Try a smaller file.";
  }
  return error.message;
}

async function uploadWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress: (pct: number) => void,
) {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Storage upload failed (${xhr.status}).`));
    };
    xhr.onerror = () =>
      reject(new Error("Network error while uploading to storage."));
    xhr.send(file);
  });
}

/**
 * Full-screen guided photo intake for First Family Movie.
 * Uses the normal R2 → /api/media/complete → moderation pipeline.
 */
export function FirstFamilyMovieGuidedUpload({
  storageBlocked = false,
  planName = "your",
  initialMediaIds = [],
  onBack,
  onContinue,
  onSkip,
  skipPending = false,
}: Props) {
  const [priorMediaIds] = useState(() =>
    Array.from(new Set(initialMediaIds.filter(Boolean))),
  );
  const [items, setItems] = useState<GuidedItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [quotaBlocked, setQuotaBlocked] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [processTick, setProcessTick] = useState(0);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const uploadStartedRef = useRef(false);
  const reachedFiveRef = useRef(priorMediaIds.length >= FFM_SOFT_MIN_PHOTOS);

  const updateItem = useCallback((id: string, patch: Partial<GuidedItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  // Revoke object URLs on unmount / remove.
  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  const processFile = useCallback(
    async (item: GuidedItem) => {
      const endUpload = beginUploadActivity();
      try {
        updateItem(item.id, {
          phase: "uploading",
          progress: 2,
          error: undefined,
        });

        const preparedResult = await prepareUploadFile(item.file);
        if (!preparedResult.ok) {
          throw new Error(preparedResult.error);
        }
        const { file, contentType, convertedFromHeic } = preparedResult.prepared;

        const urlRes = await fetch("/api/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType,
            size: file.size,
          }),
        });
        const urlBody = await urlRes.json().catch(() => ({}));
        if (!urlRes.ok) {
          if (
            urlBody.code === "storage_quota_exceeded" ||
            urlBody.code === "quota_exceeded"
          ) {
            setQuotaBlocked(
              userFacingApiError(
                urlBody,
                `Your ${planName} plan storage is full. Free up space or upgrade to upload more.`,
              ),
            );
          }
          throw new Error(
            userFacingApiError(urlBody, "Could not get upload URL."),
          );
        }

        if (typeof urlBody.key !== "string" || !urlBody.key.trim()) {
          throw new Error("Could not get upload URL.");
        }

        const proxyPutUrl =
          typeof urlBody.proxyPutUrl === "string" &&
          urlBody.proxyPutUrl.startsWith("/api/upload/put")
            ? urlBody.proxyPutUrl
            : canProxyUploadBytes(file.size)
              ? `/api/upload/put?key=${encodeURIComponent(urlBody.key)}`
              : null;
        const requiresDirectUpload =
          urlBody.requiresDirectUpload === true ||
          !canProxyUploadBytes(file.size);
        const directUrl =
          typeof urlBody.uploadUrl === "string" &&
          /^https?:\/\//i.test(urlBody.uploadUrl)
            ? urlBody.uploadUrl
            : null;

        const onPct = (pct: number) => {
          updateItem(item.id, {
            progress: Math.max(5, Math.min(92, pct)),
          });
        };

        if (directUrl) {
          try {
            await uploadWithProgress(directUrl, file, contentType, onPct);
          } catch (directError) {
            if (!isLikelyCorsOrNetworkUploadError(directError)) {
              throw directError;
            }
            if (requiresDirectUpload || !proxyPutUrl) {
              throw new Error(DIRECT_UPLOAD_REQUIRED_MESSAGE);
            }
            updateItem(item.id, { progress: 5 });
            await uploadWithProgress(proxyPutUrl, file, contentType, onPct);
          }
        } else if (proxyPutUrl) {
          await uploadWithProgress(proxyPutUrl, file, contentType, onPct);
        } else {
          throw new Error(DIRECT_UPLOAD_REQUIRED_MESSAGE);
        }

        updateItem(item.id, { progress: 96 });

        const contentHash = await sha256HexFromFile(file);
        const completeRes = await fetch("/api/media/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: urlBody.key,
            filename: file.name,
            contentType,
            size: file.size,
            ...(convertedFromHeic ? { clientConvertedFromHeic: true } : {}),
            importProvider: "device",
            ...(contentHash ? { contentHash } : {}),
          }),
        });
        const completeBody = await completeRes.json().catch(() => ({}));
        if (!completeRes.ok) {
          if (
            completeBody.code === "storage_quota_exceeded" ||
            completeBody.code === "quota_exceeded"
          ) {
            setQuotaBlocked(
              userFacingApiError(
                completeBody,
                `Your ${planName} plan storage is full. Free up space or upgrade to upload more.`,
              ),
            );
          }
          throw new Error(
            userFacingApiError(
              completeBody,
              "Could not finish saving your photo. Please try again.",
            ),
          );
        }

        const mediaId =
          typeof completeBody.mediaId === "string"
            ? completeBody.mediaId
            : undefined;
        updateItem(item.id, {
          phase: "processing",
          progress: 100,
          mediaId,
        });
        announce("Photo added", { priority: "polite", dedupeMs: 400 });
      } catch (error) {
        const message = uploadFailureMessage(error);
        updateItem(item.id, { phase: "error", error: message });
        announce(message, { priority: "assertive" });
      } finally {
        endUpload();
      }
    },
    [planName, updateItem],
  );

  const enqueueFiles = useCallback(
    (fileList: FileList | File[]) => {
      if (storageBlocked) {
        setQuotaBlocked(
          `Your ${planName} plan storage is full. Free up space or upgrade to upload more.`,
        );
        return;
      }

      const files = Array.from(fileList);
      const images = files.filter(isImageFile);
      const skipped = files.length - images.length;
      if (skipped > 0) {
        setNotice(
          skipped === 1
            ? "Videos were skipped — this step is for photos."
            : `${skipped} videos were skipped — this step is for photos.`,
        );
      } else {
        setNotice(null);
      }

      const oversized = images.filter((f) => f.size > MAX_IMAGE_BYTES);
      const ok = images.filter((f) => f.size <= MAX_IMAGE_BYTES);
      if (oversized.length > 0) {
        setNotice(
          `Some photos were over ${formatUploadLimit(MAX_IMAGE_BYTES)} and were skipped.`,
        );
      }
      if (ok.length === 0) return;

      if (!uploadStartedRef.current) {
        uploadStartedRef.current = true;
        trackFirstMovieEvent("first_movie_upload_started", {
          fileCount: ok.length,
        });
      }

      const next: GuidedItem[] = ok.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        phase: "queued",
        progress: 0,
      }));

      setItems((prev) => [...prev, ...next]);
      for (const item of next) {
        void processFile(item);
      }
    },
    [planName, processFile, storageBlocked],
  );

  // Poll moderation / clean-ready for processing items.
  useEffect(() => {
    const waiting = items.filter(
      (i) => i.phase === "processing" && i.mediaId,
    );
    if (waiting.length === 0) return;

    let cancelled = false;
    const tick = async () => {
      for (const item of waiting) {
        if (!item.mediaId) continue;
        try {
          const res = await fetch(`/api/media/${item.mediaId}/status`);
          if (!res.ok) continue;
          const body = (await res.json()) as {
            cleanReady?: boolean;
            moderationStatus?: string;
            status?: string;
          };
          if (cancelled) return;
          if (body.cleanReady) {
            updateItem(item.id, { phase: "ready" });
          } else if (
            body.moderationStatus === "rejected" ||
            body.moderationStatus === "csam_quarantined" ||
            body.status === "rejected" ||
            body.status === "csam_quarantined"
          ) {
            updateItem(item.id, {
              phase: "error",
              error: "This photo couldn’t be used. Try another.",
            });
          }
        } catch {
          // ignore transient poll errors
        }
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 3500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [items, updateItem]);

  // Rotate processing micro-copy while anything is uploading/processing.
  const isBusy = items.some(
    (i) =>
      i.phase === "queued" ||
      i.phase === "uploading" ||
      i.phase === "processing",
  );
  useEffect(() => {
    if (!isBusy) return;
    const id = window.setInterval(() => {
      setProcessTick((t) => t + 1);
    }, 2800);
    return () => window.clearInterval(id);
  }, [isBusy]);

  const sessionMediaIds = items
    .filter(
      (i) =>
        (i.phase === "processing" || i.phase === "ready") && i.mediaId,
    )
    .map((i) => i.mediaId!);

  const successfulMediaIds = useMemo(() => {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const id of [...priorMediaIds, ...sessionMediaIds]) {
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(id);
    }
    return merged;
  }, [priorMediaIds, sessionMediaIds]);

  const successfulCount = successfulMediaIds.length;

  useEffect(() => {
    if (reachedFiveRef.current) return;
    if (successfulCount < FFM_SOFT_MIN_PHOTOS) return;
    reachedFiveRef.current = true;
    trackFirstMovieEvent("first_movie_upload_reached_5", {
      photoCount: successfulCount,
    });
  }, [successfulCount]);

  const progressCopy = useMemo(
    () => getGuidedUploadProgressCopy(successfulCount),
    [successfulCount],
  );

  /** Soft min: ≥5 successfully uploaded (in pipeline). More than 5 is fine. */
  const canContinue = progressCopy.canContinue;

  const acceptImages =
    "image/jpeg,image/png,image/webp,image/heic,image/heif,image/*,.jpg,.jpeg,.png,.webp,.heic,.heif";

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-5 py-8 sm:px-8 sm:py-12">
      <div className="ffm-ritual-card px-5 py-6 sm:px-7 sm:py-8">
      <button
        type="button"
        onClick={onBack}
        className="self-start text-sm font-medium text-[color:var(--ink-muted)] transition hover:text-[color:var(--ink)]"
      >
        Back
      </button>

      <div className="mt-6 flex flex-1 flex-col">
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files?.length) {
              enqueueFiles(e.dataTransfer.files);
            }
          }}
          className={cn(
            "relative flex flex-col items-center justify-center rounded-[var(--app-radius-2xl)] border-2 border-dashed px-5 py-12 text-center transition sm:py-14",
            dragging
              ? "border-[color:var(--accent-deep)] bg-[color:var(--accent-soft)]"
              : "border-[color:var(--border-strong)] bg-[color:var(--surface-elevated)]/90",
          )}
        >
          <input
            ref={galleryInputRef}
            type="file"
            accept={acceptImages}
            multiple
            className="sr-only"
            aria-label="Choose photos from gallery"
            onChange={(e) => {
              if (e.target.files?.length) {
                enqueueFiles(e.target.files);
                e.target.value = "";
              }
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            aria-label="Take a photo with camera"
            onChange={(e) => {
              if (e.target.files?.length) {
                enqueueFiles(e.target.files);
                e.target.value = "";
              }
            }}
          />

          <div className="flex size-14 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent-deep)]">
            <ImagePlus className="size-7" aria-hidden />
          </div>
          <p className="mt-5 max-w-sm font-display text-xl leading-snug tracking-tight text-[color:var(--ink)] sm:text-2xl">
            Drop 5–10 of your favorite family photos here
          </p>
          <p className="mt-2 text-sm text-[color:var(--ink-muted)]">
            Or choose from your gallery
            <span className="hidden sm:inline"> — drag and drop works too</span>
            .
          </p>

          <div className="mt-8 flex w-full max-w-sm flex-col gap-2.5 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="ui-btn ui-btn-primary inline-flex h-11 flex-1 items-center justify-center gap-2 px-4 text-sm font-semibold"
            >
              <Images className="size-4" aria-hidden />
              Choose photos
            </button>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="ui-btn ui-btn-secondary inline-flex h-11 flex-1 items-center justify-center gap-2 px-4 text-sm font-semibold"
            >
              <Camera className="size-4" aria-hidden />
              Camera
            </button>
          </div>
        </div>

        <div className="mt-6" aria-live="polite">
          <p className="font-medium text-[color:var(--ink)]">
            {progressCopy.progressLine}
          </p>
          <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
            {progressCopy.encouragement}
          </p>
          {isBusy ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-[color:var(--accent-deep)]">
              <LoaderCircle
                className="size-3.5 shrink-0 animate-spin"
                aria-hidden
              />
              {getProcessingMicroCopy(processTick)}
            </p>
          ) : null}

          <div
            className="mt-4 h-1.5 overflow-hidden rounded-full bg-[color:var(--border-subtle)]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={FFM_SOFT_MIN_PHOTOS}
            aria-valuenow={Math.min(successfulCount, FFM_SOFT_MIN_PHOTOS)}
            aria-label="Photos toward minimum"
          >
            <div
              className="h-full rounded-full bg-[color:var(--accent-deep)] transition-[width] duration-500 ease-out"
              style={{
                width: `${Math.min(100, (successfulCount / FFM_SOFT_MIN_PHOTOS) * 100)}%`,
              }}
            />
          </div>
        </div>

        {notice ? (
          <p className="mt-4 text-sm text-[color:var(--ink-muted)]" role="status">
            {notice}
          </p>
        ) : null}

        {quotaBlocked ? (
          <div className="mt-4">
            <UpgradePrompt
              variant="blocked"
              message={quotaBlocked}
              hint="Your existing memories are safe — only new uploads are paused."
              ctaLabel="Upgrade for more storage"
            />
          </div>
        ) : null}

        {items.length > 0 ? (
          <ul className="mt-6 grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="relative aspect-square overflow-hidden rounded-[var(--app-radius-lg)] bg-[color:var(--canvas-deep)] shadow-[var(--shadow-sm)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.previewUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <div
                  className={cn(
                    "absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[color:var(--ink)]/45 px-1 text-center text-[10px] font-medium leading-tight text-white backdrop-blur-[1px]",
                    item.phase === "ready" && "bg-[color:var(--ink)]/25",
                    item.phase === "error" && "bg-red-950/55",
                  )}
                >
                  {item.phase === "ready" ? (
                    <CheckCircle2 className="size-5 text-emerald-200" />
                  ) : item.phase === "error" ? (
                    <>
                      <AlertCircle className="size-5 text-red-200" />
                      <span className="line-clamp-3 px-0.5">
                        {item.error || "Failed"}
                      </span>
                    </>
                  ) : item.phase === "processing" ? (
                    <>
                      <LoaderCircle className="size-5 animate-spin text-white/90" />
                      <span>Looking for people…</span>
                    </>
                  ) : (
                    <>
                      <LoaderCircle className="size-5 animate-spin text-white/90" />
                      <span>{Math.max(item.progress, 4)}%</span>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="sticky bottom-0 mt-8 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-elevated)]/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-sm">
        <button
          type="button"
          disabled={!canContinue || skipPending}
          onClick={() => onContinue(successfulMediaIds)}
          className="ui-btn ui-btn-primary inline-flex h-12 w-full items-center justify-center px-6 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-45"
        >
          Continue
        </button>
        {onSkip ? (
          <button
            type="button"
            onClick={onSkip}
            disabled={skipPending}
            className="ui-btn ui-btn-ghost mt-2 inline-flex h-11 w-full items-center justify-center px-5 text-sm font-semibold text-[color:var(--ink-muted)] disabled:opacity-60"
          >
            {skipPending ? "Skipping…" : "Skip"}
          </button>
        ) : null}
        {!canContinue ? (
          <p className="mt-2 text-center text-xs text-[color:var(--ink-muted)]">
            Add at least {FFM_SOFT_MIN_PHOTOS} photos to continue
          </p>
        ) : (
          <p className="mt-2 text-center text-xs text-[color:var(--ink-muted)]">
            You can add more photos anytime — or continue when ready.
          </p>
        )}
      </div>
      </div>
    </main>
  );
}
