"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileImage,
  LoaderCircle,
  Shield,
  Upload,
} from "lucide-react";
import { ALLOWED_UPLOAD_TYPES } from "@/lib/upload/constants";
import { prepareUploadFile } from "@/lib/upload/prepare-upload-file";
import { UpgradePrompt } from "@/components/billing/UpgradePrompt";
import { COPY } from "@/lib/copy";
import { userFacingApiError } from "@/lib/http/user-messages";
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
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function isLikelyCorsOrNetworkUploadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("network error while uploading to storage") ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror")
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
};

export function MediaUploader({
  storageBlocked = false,
  planName = "your",
}: MediaUploaderProps) {
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
      try {
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

        const proxyPutUrl =
          typeof urlBody.proxyPutUrl === "string" && urlBody.proxyPutUrl
            ? urlBody.proxyPutUrl
            : `/api/upload/put?key=${encodeURIComponent(urlBody.key)}`;

        try {
          await uploadWithProgress(
            urlBody.uploadUrl,
            file,
            contentType,
            (pct) => {
              updateItem(item.id, {
                progress: Math.max(5, Math.min(95, pct)),
              });
            },
          );
        } catch (directError) {
          // iPhone on LAN often fails here: R2 CORS only allows localhost.
          // Fall back to same-origin proxy (no browser↔R2 CORS needed).
          if (!isLikelyCorsOrNetworkUploadError(directError)) {
            throw directError;
          }
          console.warn(
            "[MediaUploader] Direct R2 PUT failed; retrying via same-origin proxy",
            directError,
          );
          updateItem(item.id, { progress: 5 });
          await uploadWithProgress(proxyPutUrl, file, contentType, (pct) => {
            updateItem(item.id, {
              progress: Math.max(5, Math.min(95, pct)),
            });
          });
        }

        updateItem(item.id, { status: "finalizing", progress: 97 });

        const completeRes = await fetch("/api/media/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: urlBody.key,
            filename: file.name,
            contentType,
            size: file.size,
            ...(convertedFromHeic ? { clientConvertedFromHeic: true } : {}),
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
      } catch (error) {
        updateItem(item.id, {
          status: "error",
          error:
            error instanceof Error
              ? error.message
              : "Upload failed. Please try again.",
        });
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
      const next: UploadItem[] = [];
      for (const file of Array.from(fileList)) {
        const id = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`;
        // Full MIME/HEIC prep runs in processFile so we can await conversion.
        next.push({ id, file, status: "queued", progress: 0 });
      }

      setItems((prev) => [...next, ...prev]);
      for (const item of next) {
        void processFile(item);
      }
    },
    [processFile, planName, storageBlocked],
  );

  return (
    <div className="space-y-6">
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
          "upload-dropzone relative flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition",
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
          <p className="font-medium text-ink">Drop photos or videos here</p>
          <p className="mt-1 text-sm text-ink-muted">
            Or tap to choose from your camera roll. JPEG, PNG, WebP, HEIC, MP4,
            MOV, WebM — up to {formatBytes(25 * 1024 * 1024)} for photos.
          </p>
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
        <p>Safety first: {COPY.upload.safetyNote}</p>
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
                    Received — safety check in progress. It will appear in Photos
                    when ready.
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
