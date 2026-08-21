"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Shield } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { ImportPhotosMenu } from "@/components/media/ImportPhotosMenu";
import type { ImportCenterSeed } from "@/components/media/ImportCenter";
import { CloudImportDialog } from "@/components/media/CloudImportDialog";
import { MediaUploader } from "@/components/upload/MediaUploader";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { announce } from "@/lib/a11y/announce";
import type { MediaImportProvider } from "@/lib/media/import/types";
import { cn } from "@/lib/utils";

type PendingItem = {
  mediaId: string;
  filename: string;
  cleanReady: boolean;
};

type MediaIntakePanelProps = {
  memoryId?: string | null;
  /** When true and memoryId set, imported/uploaded media attach after clean. */
  defaultAttachToMemory?: boolean;
  /** Called when a media item becomes clean/ready (create-memory selection). */
  onMediaReady?: (mediaId: string) => void;
  /** Called when uploads/imports are queued (for UX messaging). */
  onQueued?: (mediaIds: string[]) => void;
  compact?: boolean;
  className?: string;
  showAttachToggle?: boolean;
  /** Hide the primary Upload button (Import menu still offers device upload). */
  showUploadButton?: boolean;
  /** Start with the device uploader visible (Upload page). */
  initialShowUploader?: boolean;
  /** Larger CTAs for Photos / Upload page toolbars. */
  variant?: "default" | "page";
  storageBlocked?: boolean;
  planName?: string;
};

export function MediaIntakePanel({
  memoryId = null,
  defaultAttachToMemory = Boolean(memoryId),
  onMediaReady,
  onQueued,
  compact = true,
  className,
  showAttachToggle = Boolean(memoryId),
  showUploadButton = true,
  initialShowUploader = false,
  variant = "default",
  storageBlocked = false,
  planName = "your",
}: MediaIntakePanelProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [showUploader, setShowUploader] = useState(initialShowUploader);
  const [attachToMemory, setAttachToMemory] = useState(defaultAttachToMemory);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [cloudProvider, setCloudProvider] = useState<
    "google_drive" | "dropbox" | null
  >(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [exportSeed, setExportSeed] = useState<ImportCenterSeed | null>(null);
  const [activeImportProvider, setActiveImportProvider] =
    useState<MediaImportProvider>("device");

  const effectiveAttachId =
    attachToMemory && memoryId ? memoryId : null;

  useEffect(() => {
    setAttachToMemory(defaultAttachToMemory);
  }, [defaultAttachToMemory]);

  // Handle OAuth return query (?import=connected&provider=…)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const notice = params.get("import");
    if (!notice) return;

    if (notice === "connected") {
      const provider = params.get("provider");
      setBanner(t("mediaImport.connectedBanner"));
      if (provider === "google_drive" || provider === "dropbox") {
        setCloudProvider(provider);
      }
    } else if (notice === "denied") {
      setBanner(t("mediaImport.deniedBanner"));
    } else if (notice === "unavailable") {
      setBanner(t("mediaImport.unavailableBanner"));
    } else if (notice === "error") {
      setBanner(t("mediaImport.errorBanner"));
    }

    params.delete("import");
    params.delete("provider");
    params.delete("memoryId");
    params.delete("attach");
    const next = params.toString();
    const url = next ? `${pathname}?${next}` : pathname;
    window.history.replaceState({}, "", url);
  }, [pathname, t]);

  const trackMediaIds = useCallback(
    (mediaIds: string[], filenames?: string[]) => {
      if (mediaIds.length === 0) return;
      setPending((prev) => {
        const existing = new Set(prev.map((p) => p.mediaId));
        const next = [...prev];
        mediaIds.forEach((id, index) => {
          if (existing.has(id)) return;
          next.push({
            mediaId: id,
            filename: filenames?.[index] ?? id,
            cleanReady: false,
          });
        });
        return next;
      });
      onQueued?.(mediaIds);
    },
    [onQueued],
  );

  // Poll pending uploads until clean/ready (or terminal failure).
  useEffect(() => {
    const waiting = pending.filter((p) => !p.cleanReady);
    if (waiting.length === 0) return;

    let cancelled = false;
    const tick = async () => {
      for (const item of waiting) {
        try {
          const res = await fetch(`/api/media/${item.mediaId}/status`);
          if (!res.ok) continue;
          const body = await res.json();
          if (cancelled) return;
          if (body.cleanReady) {
            setPending((prev) =>
              prev.map((p) =>
                p.mediaId === item.mediaId ? { ...p, cleanReady: true } : p,
              ),
            );
            onMediaReady?.(item.mediaId);
            announce(t("mediaImport.readyAnnounce"), { priority: "polite" });
            router.refresh();
          } else if (
            body.moderationStatus === "rejected" ||
            body.moderationStatus === "csam_quarantined" ||
            body.status === "rejected" ||
            body.status === "csam_quarantined"
          ) {
            setPending((prev) =>
              prev.filter((p) => p.mediaId !== item.mediaId),
            );
          }
        } catch {
          // ignore transient poll errors
        }
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pending, onMediaReady, router, t]);

  function openDeviceUpload() {
    setActiveImportProvider("device");
    setExportSeed(null);
    setShowUploader(true);
  }

  function onExportPackageReady(seed: ImportCenterSeed) {
    setActiveImportProvider(seed.provider);
    setExportSeed(seed);
    setShowUploader(true);
    setBanner(
      t("mediaImport.zipQueued", {
        count: seed.files.length,
        source: seed.provider,
      }),
    );
  }

  const waitingCount = pending.filter((p) => !p.cleanReady).length;
  const readyCount = pending.filter((p) => p.cleanReady).length;
  const isPage = variant === "page";

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {showUploadButton ? (
          <button
            type="button"
            onClick={() => {
              setShowUploader(true);
            }}
            className={cn(
              "inline-flex items-center gap-2 rounded-md bg-accent font-medium text-accent-foreground transition hover:bg-accent-deep",
              isPage ? "ui-btn ui-btn-primary ui-btn-lg" : "px-3 py-2 text-sm",
            )}
          >
            {t("mediaImport.uploadPhotos")}
          </button>
        ) : null}
        <ImportPhotosMenu
          returnTo={pathname}
          memoryId={memoryId}
          attachToMemory={attachToMemory}
          onDeviceUpload={openDeviceUpload}
          onProviderReady={(provider) => setCloudProvider(provider)}
          onExportPackageReady={onExportPackageReady}
          buttonClassName={
            isPage
              ? "ui-btn ui-btn-secondary ui-btn-lg"
              : undefined
          }
          label={
            isPage ? t("mediaImport.importPhotos") : undefined
          }
        />
      </div>

      {showAttachToggle ? (
        <label className="flex items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-1"
            checked={attachToMemory}
            onChange={(event) => setAttachToMemory(event.target.checked)}
          />
          <span>{t("mediaImport.attachToThisMemory")}</span>
        </label>
      ) : null}

      {banner ? (
        <p className="rounded-md border border-ink/10 bg-canvas-deep/60 px-3 py-2 text-sm text-ink" role="status">
          {banner}
        </p>
      ) : null}

      {showUploader ? (
        <div className="rounded-lg border border-ink/10 bg-canvas-deep/40 p-3">
          <MediaUploader
            compact={compact}
            attachMemoryId={effectiveAttachId}
            storageBlocked={storageBlocked}
            planName={planName}
            importProvider={activeImportProvider}
            seedFiles={exportSeed?.files ?? null}
            seedKey={exportSeed?.key ?? null}
            importExternalIds={exportSeed?.externalIds ?? null}
            onUploaded={(info) => {
              trackMediaIds([info.mediaId], [info.filename]);
            }}
          />
        </div>
      ) : null}

      {waitingCount > 0 || readyCount > 0 ? (
        <div className="flex gap-2 rounded-md border border-accent/20 bg-accent/10 px-3 py-2 text-sm text-accent-deep">
          <Shield className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">
              {waitingCount > 0
                ? t("mediaImport.safetyInProgress", { count: waitingCount })
                : t("mediaImport.allReady", { count: readyCount })}
            </p>
            <p className="mt-0.5 text-xs opacity-90">
              {memoryId
                ? t("mediaImport.safetyMemoryHint")
                : t("mediaImport.safetyLibraryHint")}
            </p>
            <ul className="mt-2 space-y-1 text-xs">
              {pending.map((item) => (
                <li key={item.mediaId} className="flex items-center gap-2">
                  {item.cleanReady ? (
                    <span className="text-emerald-800">{t("mediaImport.ready")}</span>
                  ) : (
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                  )}
                  <span className="truncate">{item.filename}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <CloudImportDialog
        open={cloudProvider !== null}
        provider={cloudProvider ?? "google_drive"}
        attachMemoryId={effectiveAttachId}
        onClose={() => setCloudProvider(null)}
        onImported={(mediaIds) => {
          trackMediaIds(mediaIds);
          setShowUploader(false);
        }}
      />
    </div>
  );
}
