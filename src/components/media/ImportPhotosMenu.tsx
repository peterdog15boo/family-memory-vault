"use client";

import { useState } from "react";
import { Import } from "lucide-react";
import { ImportCenter, type ImportCenterSeed } from "@/components/media/ImportCenter";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

type ImportPhotosMenuProps = {
  returnTo: string;
  memoryId?: string | null;
  attachToMemory?: boolean;
  onDeviceUpload?: () => void;
  onProviderReady?: (provider: "google_drive" | "dropbox") => void;
  onExportPackageReady?: (seed: ImportCenterSeed) => void;
  className?: string;
  buttonClassName?: string;
  label?: string;
};

/**
 * Opens the Import center (prioritized device → zip export → Dropbox → Drive).
 */
export function ImportPhotosMenu({
  returnTo,
  memoryId = null,
  attachToMemory = false,
  onDeviceUpload,
  onProviderReady,
  onExportPackageReady,
  className,
  buttonClassName,
  label,
}: ImportPhotosMenuProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("relative inline-flex", className)}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-2 rounded-md border border-ink/12 bg-canvas/90 px-3 py-2 text-sm font-medium text-ink transition hover:border-accent/35",
          buttonClassName,
        )}
      >
        <Import className="size-3.5" aria-hidden />
        {label ?? t("mediaImport.importPhotos")}
      </button>

      <ImportCenter
        open={open}
        onClose={() => setOpen(false)}
        returnTo={returnTo}
        memoryId={memoryId}
        attachToMemory={attachToMemory}
        onDeviceUpload={onDeviceUpload}
        onProviderReady={onProviderReady}
        onExportPackageReady={onExportPackageReady}
      />
    </div>
  );
}
