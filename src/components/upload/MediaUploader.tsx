"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileImage,
  LoaderCircle,
  Shield,
  Upload,
} from "lucide-react";
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  canProxyUploadBytes,
  formatUploadLimit,
} from "@/lib/upload/constants";
import { prepareUploadFile } from "@/lib/upload/prepare-upload-file";
import { sha256HexFromFile } from "@/lib/media/import/content-hash-client";
import { UpgradePrompt } from "@/components/billing/UpgradePrompt";
import { useCopy, useTranslations } from "@/components/i18n/LocaleProvider";
import { userFacingApiError } from "@/lib/http/user-messages";
import { beginUploadActivity } from "@/lib/session/upload-activity";
import { announce } from "@/lib/a11y/announce";
import { cn } from "@/lib/utils";

type UploadItemStatus =
  | "queued"
  | "requesting_url"
  | "uploading"
  | "finalizing"
  | "done"
  | "error";

type UploadItem = {
  id: string;
  file: File;
  status: UploadItemStatus;
  progress: number;
  error?: string;
  mediaId?: string;
  importExternalId?: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
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
      else {
        let detail = "";
        try {
          const parsed = JSON.parse(xhr.responseText) as { error?: string };
          if (parsed.error) detail = ` ${parsed.error}`;
        } catch {
          // ignore
        }
        reject(new Error(`Storage upload failed (${xhr.status}).${detail}`));
      }
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "Network error while uploading to storage. If this keeps happening, confirm R2 bucket CORS allows your app origin for PUT.",
        ),
      );
    xhr.send(file);
  });
}

function uploadFailureMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Upload failed.";
  if (/\(413\)/.test(error.message)) {
    return (
      "Upload was blocked because the file is too large for the server proxy " +
      "(common on Vercel when R2 CORS is missing). Add your production site " +
      "origin to the R2 bucket CORS AllowedOrigins, then try again so the " +
      "browser can upload directly to storage."
    );
  }
  return error.message;
}

const DIRECT_UPLOAD_REQUIRED_MESSAGE =
  "This video is too large for the backup upload path. " +
  "Confirm R2 CORS allows your site origin for PUT, then try again so the " +
  "browser can upload directly to storage (home movies up to " +
  `${formatUploadLimit(MAX_VIDEO_BYTES)}).`;

function isLikelyCorsOrNetworkUploadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  if (/\(404\)/.test(error.message)) return true;
  // 403/405 from R2 often means missing bucket CORS (browser blocked the real PUT).
  return (
    msg.includes("network error while uploading to storage") ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    /\(403\)/.test(error.message) ||
    /\(405\)/.test(error.message)
  );
}

/**
 * MediaUploader
 *
 * Drag & drop + multi-file uploads to R2 via short-lived presigned URLs.
 * After PUT succeeds, calls /api/media/complete which records the media as
 * pending_moderation and enqueues a "moderation" job.
 *
 * Mobile (iPhone): resolves empty MIME from extension and converts HEIC→JPEG
 * when the browser can decode it so moderation/thumbnails stay reliable.
 */
type MediaUploaderProps = {
  storageBlocked?: boolean;
  planName?: string;
  /** Compact dropzone for Memories / inline intake. */
  compact?: boolean;
  /** Optional memory to auto-attach after clean/ready. */
  attachMemoryId?: string | null;
  /** Import provenance for complete API (device / export / cloud). */
  importProvider?:
    | "device"
    | "export_package"
    | "google_takeout"
    | "google_drive"
    | "dropbox"
    | "facebook"
    | "instagram"
    | "tiktok"
    | null;
  /** Optional external ids aligned with seedFiles (zip entry paths). */
  importExternalIds?: Array<string | null> | null;
  /** Programmatically enqueue files (e.g. unzipped export package). */
  seedFiles?: File[] | null;
  seedKey?: string | number | null;
  /** Called when each file finishes /api/media/complete successfully. */
  onUploaded?: (info: {
    mediaId: string;
    filename: string;
    status: string;
    moderationStatus: string;
  }) => void;
  className?: string;
};

export function MediaUploader({
  storageBlocked = false,
  planName = "your",
  compact = false,
  attachMemoryId = null,
  importProvider = "device",
  importExternalIds = null,
  seedFiles = null,
  seedKey = null,
  onUploaded,
  className,
}: MediaUploaderProps) {
  const copy = useCopy();
  const t = useTranslations();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [quotaBlocked, setQuotaBlocked] = useState<string | null>(null);

  const accept = useMemo(
    () =>
      [
        ...ALLOWED_UPLOAD_TYPES,
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".heic",
        ".heif",
        ".mp4",
        ".mov",
        ".webm",
        "image/*",
        "video/*",
      ].join(","),
    [],
  );

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const processFile = useCallback(
    async (item: UploadItem) => {
      const endUpload = beginUploadActivity();
      try {
        announce(t("a11y.uploadStarted"), { priority: "polite", dedupeMs: 400 });
        updateItem(item.id, {
          status: "requesting_url",
          progress: 0,
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
          if (urlBody.code === "r2_not_configured") {
            setConfigError(userFacingApiError(urlBody));
          } else if (
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

        updateItem(item.id, { status: "uploading", progress: 5 });

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
            progress: Math.max(5, Math.min(95, pct)),
          });
        };

        if (directUrl) {
          try {
            await uploadWithProgress(directUrl, file, contentType, onPct);
          } catch (directError) {
            // iPhone on LAN often fails here: R2 CORS only allows localhost.
            // Fall back to same-origin proxy (no browser↔R2 CORS needed) —
            // but only for files small enough to buffer through Next.js.
            if (!isLikelyCorsOrNetworkUploadError(directError)) {
              throw directError;
            }
            if (requiresDirectUpload || !proxyPutUrl) {
              throw new Error(DIRECT_UPLOAD_REQUIRED_MESSAGE);
            }
            console.warn(
              "[MediaUploader] Direct R2 PUT failed; retrying via same-origin proxy",
              directError,
            );
            updateItem(item.id, { progress: 5 });
            await uploadWithProgress(proxyPutUrl, file, contentType, onPct);
          }
        } else if (proxyPutUrl) {
          await uploadWithProgress(proxyPutUrl, file, contentType, onPct);
        } else {
          throw new Error(DIRECT_UPLOAD_REQUIRED_MESSAGE);
        }

        updateItem(item.id, { status: "finalizing", progress: 97 });

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
            ...(attachMemoryId ? { attachMemoryId } : {}),
            importProvider: importProvider ?? "device",
            ...(item.importExternalId
              ? { importExternalId: item.importExternalId }
              : {}),
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
              "Could not finish saving your upload. Please try again.",
            ),
          );
        }

        updateItem(item.id, {
          status: "done",
          progress: 100,
          mediaId: completeBody.mediaId,
        });
        if (typeof completeBody.mediaId === "string") {
          onUploaded?.({
            mediaId: completeBody.mediaId,
            filename: file.name,
            status: String(completeBody.status ?? "pending_moderation"),
            moderationStatus: String(
              completeBody.moderationStatus ?? "pending",
            ),
          });
        }
        announce(t("a11y.uploadCompleted"), { priority: "polite" });
      } catch (error) {
        const message = uploadFailureMessage(error);
        updateItem(item.id, {
          status: "error",
          error: message,
        });
        announce(message || t("a11y.uploadFailed"), { priority: "assertive" });
      } finally {
        endUpload();
      }
    },
    [attachMemoryId, importProvider, onUploaded, planName, t, updateItem],
  );

  const enqueueFiles = useCallback(
    (
      fileList: FileList | File[],
      options?: { externalIds?: Array<string | null | undefined> },
    ) => {
      if (storageBlocked) {
        setQuotaBlocked(
          `Your ${planName} plan storage is full. Free up space or upgrade to upload more.`,
        );
        return;
      }
      const next: UploadItem[] = [];
      Array.from(fileList).forEach((file, index) => {
        const id = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`;
        const externalId = options?.externalIds?.[index];
        next.push({
          id,
          file,
          status: "queued",
          progress: 0,
          ...(typeof externalId === "string" && externalId
            ? { importExternalId: externalId }
            : {}),
        });
      });

      setItems((prev) => [...next, ...prev]);
      for (const item of next) {
        void processFile(item);
      }
    },
    [processFile, planName, storageBlocked],
  );

  const lastSeedKey = useRef<string | number | null>(null);
  useEffect(() => {
    if (!seedFiles?.length) return;
    if (seedKey != null && seedKey === lastSeedKey.current) return;
    lastSeedKey.current = seedKey ?? Date.now();
    enqueueFiles(seedFiles, {
      externalIds: importExternalIds ?? undefined,
    });
  }, [seedFiles, seedKey, enqueueFiles, importExternalIds]);

  return (
    <div className={cn("space-y-6", className)}>
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
          "upload-dropzone relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed text-center transition",
          "focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/40",
          compact ? "min-h-[140px] px-4 py-6" : "min-h-[220px] px-6 py-10",
          dragging
            ? "border-accent bg-accent/10"
            : "border-ink/15 bg-[color:var(--surface-elevated)]/80 hover:border-accent/40",
        )}
      >
        <input
          type="file"
          accept={accept}
          multiple
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={t("upload.dropTitle")}
          onChange={(e) => {
            if (e.target.files?.length) {
              enqueueFiles(e.target.files);
              e.target.value = "";
            }
          }}
        />
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Upload className="h-6 w-6" aria-hidden />
        </div>
        <div>
          <p className="font-medium text-ink">{t("upload.dropTitle")}</p>
          <p className="mt-1 text-sm text-ink-muted">
            {compact
              ? t("upload.compactHint", {
                  photoMax: formatUploadLimit(MAX_IMAGE_BYTES),
                  videoMax: formatUploadLimit(MAX_VIDEO_BYTES),
                })
              : t("upload.dropSizeHint")}
          </p>
          {!compact ? (
            <p className="mt-2 text-xs text-ink-muted">
              {t("upload.limitsLine", {
                photoMax: formatUploadLimit(MAX_IMAGE_BYTES),
                videoMax: formatUploadLimit(MAX_VIDEO_BYTES),
              })}
            </p>
          ) : null}
        </div>
      </div>

      {configError ? (
        <div className="flex gap-2 rounded-md border border-red-800/15 bg-red-50 px-4 py-3 text-sm text-red-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{configError}</p>
        </div>
      ) : null}

      {quotaBlocked ? (
        <UpgradePrompt
          variant="blocked"
          message={quotaBlocked}
          hint="Your existing memories are safe — only new uploads are paused."
          ctaLabel="Upgrade for more storage"
        />
      ) : null}

      <div className="upload-safety-note flex gap-2 rounded-md border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-accent-deep">
        <Shield className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{t("upload.safetyFirst", { note: copy.upload.safetyNote })}</p>
      </div>

      {items.length > 0 ? (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 rounded-lg border border-ink/10 bg-[color:var(--surface-elevated)] px-4 py-3"
            >
              <FileImage className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium text-ink">
                    {item.file.name}
                  </p>
                  <StatusIcon status={item.status} />
                </div>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {formatBytes(item.file.size)}
                  {item.file.type ? ` · ${item.file.type}` : ""}
                </p>
                {item.status === "error" && item.error ? (
                  <p className="mt-1 text-sm text-red-800">{item.error}</p>
                ) : null}
                {item.status !== "error" && item.status !== "done" ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10">
                    <div
                      className="h-full rounded-full bg-accent transition-[width]"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                ) : null}
                {item.status === "done" ? (
                  <p className="mt-1 text-xs text-ink-muted">
                    {t("upload.received")}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function StatusIcon({ status }: { status: UploadItemStatus }) {
  if (status === "done") {
    return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-700" />;
  }
  if (status === "error") {
    return <AlertCircle className="h-5 w-5 shrink-0 text-red-700" />;
  }
  return (
    <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-accent" />
  );
}
