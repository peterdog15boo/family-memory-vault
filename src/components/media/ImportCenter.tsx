"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Archive,
  Cloud,
  HardDrive,
  Loader2,
  Shield,
  Smartphone,
  X,
} from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import { userFacingApiError } from "@/lib/http/user-messages";
import { extractMediaFromExportZip } from "@/lib/media/import/export-zip";
import type {
  MediaConnectionPublic,
  MediaImportProvider,
  MediaImportProviderInfo,
  MediaImportSection,
} from "@/lib/media/import/types";
import { cn } from "@/lib/utils";

export type ImportCenterSeed = {
  files: File[];
  externalIds: string[];
  provider: MediaImportProvider;
  key: number;
};

type ImportCenterProps = {
  open: boolean;
  onClose: () => void;
  returnTo: string;
  memoryId?: string | null;
  attachToMemory?: boolean;
  onDeviceUpload?: () => void;
  onProviderReady?: (provider: "google_drive" | "dropbox") => void;
  onExportPackageReady?: (seed: ImportCenterSeed) => void;
};

const SECTION_ORDER: MediaImportSection[] = [
  "device",
  "export_package",
  "cloud",
  "direct_social",
];

function ProviderIcon({ id }: { id: string }) {
  if (id === "device") return <Smartphone className="size-4" aria-hidden />;
  if (id === "export_package" || id === "google_takeout") {
    return <Archive className="size-4" aria-hidden />;
  }
  if (id === "google_drive" || id === "dropbox") {
    return <HardDrive className="size-4" aria-hidden />;
  }
  return <Cloud className="size-4" aria-hidden />;
}

function sectionTitle(
  section: MediaImportSection,
  t: (key: string) => string,
): string {
  if (section === "device") return t("mediaImport.sectionDevice");
  if (section === "export_package") return t("mediaImport.sectionExport");
  if (section === "cloud") return t("mediaImport.sectionCloud");
  return t("mediaImport.sectionDirect");
}

function availabilityBadge(
  provider: MediaImportProviderInfo,
  t: (key: string) => string,
): string | null {
  if (provider.availability === "pending_authorization") {
    return t("mediaImport.availableAfterAuth");
  }
  if (provider.availability === "needs_config") {
    return t("mediaImport.needsConfig");
  }
  if (provider.availability === "limited") {
    return t("mediaImport.limited");
  }
  if (provider.availability === "unavailable") {
    return t("mediaImport.availableAfterAuth");
  }
  return null;
}

/**
 * Import center — prioritized workable sources first (device → zip export →
 * Dropbox → Drive), with honest pending-auth states for Meta/TikTok direct connect.
 */
export function ImportCenter({
  open,
  onClose,
  returnTo,
  memoryId = null,
  attachToMemory = false,
  onDeviceUpload,
  onProviderReady,
  onExportPackageReady,
}: ImportCenterProps) {
  const t = useTranslations();
  const titleId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<MediaImportProviderInfo[]>([]);
  const [connections, setConnections] = useState<MediaConnectionPublic[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [zipBusy, setZipBusy] = useState(false);
  const [zipNotice, setZipNotice] = useState<string | null>(null);
  const [detail, setDetail] = useState<MediaImportProviderInfo | null>(null);

  useOverlayA11y({
    open,
    onClose,
    containerRef,
  });

  useEffect(() => {
    if (!open) return;
    setDetail(null);
    setError(null);
    setZipNotice(null);
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/media/import/providers");
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(userFacingApiError(body, t("mediaImport.loadError")));
        }
        if (cancelled) return;
        setProviders(body.providers ?? []);
        setConnections(body.connections ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : t("mediaImport.loadError"),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  function isConnected(providerId: string) {
    return connections.some(
      (c) => c.provider === providerId && c.status === "active",
    );
  }

  async function startOAuth(provider: "google_drive" | "dropbox") {
    setBusyProvider(provider);
    setError(null);
    try {
      const res = await fetch(`/api/media/import/oauth/${provider}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          returnTo,
          memoryId,
          attachToMemory: Boolean(attachToMemory && memoryId),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.authUrl !== "string") {
        throw new Error(
          userFacingApiError(body, t("mediaImport.connectError")),
        );
      }
      window.location.href = body.authUrl;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("mediaImport.connectError"),
      );
      setBusyProvider(null);
    }
  }

  async function onZipSelected(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setZipBusy(true);
    setError(null);
    setZipNotice(null);
    try {
      const result = await extractMediaFromExportZip(file);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onExportPackageReady?.({
        files: result.files.map((f) => f.file),
        externalIds: result.files.map(
          (f) => `${result.detectedProvider}:${f.path}`,
        ),
        provider: result.detectedProvider,
        key: Date.now(),
      });
      setZipNotice(
        result.skipped > 0
          ? t("mediaImport.zipQueuedWithSkipped", {
              count: result.files.length,
              skipped: result.skipped,
              source: result.detectedProvider,
            })
          : t("mediaImport.zipQueued", {
              count: result.files.length,
              source: result.detectedProvider,
            }),
      );
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("mediaImport.zipError"),
      );
    } finally {
      setZipBusy(false);
      if (zipInputRef.current) zipInputRef.current.value = "";
    }
  }

  function chooseProvider(provider: MediaImportProviderInfo) {
    setError(null);
    setZipNotice(null);

    if (provider.id === "device") {
      onClose();
      onDeviceUpload?.();
      return;
    }

    if (provider.acceptsExportZip) {
      zipInputRef.current?.click();
      return;
    }

    if (
      provider.section === "direct_social" ||
      provider.availability === "pending_authorization" ||
      provider.availability === "unavailable" ||
      provider.availability === "limited" ||
      provider.availability === "needs_config"
    ) {
      setDetail(provider);
      return;
    }

    if (
      (provider.id === "google_drive" || provider.id === "dropbox") &&
      provider.canBrowse
    ) {
      if (isConnected(provider.id)) {
        onClose();
        onProviderReady?.(provider.id);
        return;
      }
      setDetail(provider);
    }
  }

  if (!open) return null;

  const grouped = SECTION_ORDER.map((section) => ({
    section,
    items: providers
      .filter((p) => p.section === section)
      .sort((a, b) => a.priority - b.priority),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-xl border border-ink/12 bg-canvas shadow-xl sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink/8 px-4 py-3">
          <div>
            <h2 id={titleId} className="font-display text-lg text-ink">
              {t("mediaImport.centerTitle")}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              {t("mediaImport.centerLead")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-ink-muted transition hover:bg-ink/5 hover:text-ink"
            aria-label={t("common.close")}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="mb-3 flex gap-2 rounded-md border border-accent/20 bg-accent/10 px-3 py-2 text-xs text-accent-deep">
            <Shield className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <p>{t("mediaImport.centerSafety")}</p>
          </div>

          <input
            ref={zipInputRef}
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            aria-hidden
            tabIndex={-1}
            onChange={(event) => void onZipSelected(event.target.files)}
          />

          {loading ? (
            <div className="flex items-center gap-2 py-10 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("common.loading")}
            </div>
          ) : detail ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-ink">{detail.label}</p>
              <p className="text-sm text-ink-muted">{detail.permissionNote}</p>
              {detail.availability === "pending_authorization" ||
              detail.availability === "unavailable" ? (
                <p className="rounded-md border border-ink/10 bg-canvas-deep/40 px-3 py-2 text-xs text-ink-muted">
                  {t("mediaImport.comingSoonDetail")}
                </p>
              ) : null}
              {detail.limitationNote ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  {detail.limitationNote}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {(detail.id === "google_drive" || detail.id === "dropbox") &&
                detail.canConnect ? (
                  <button
                    type="button"
                    disabled={busyProvider === detail.id}
                    onClick={() =>
                      void startOAuth(detail.id as "google_drive" | "dropbox")
                    }
                    className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground"
                  >
                    {busyProvider === detail.id ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : null}
                    {t("mediaImport.connectAccount")}
                  </button>
                ) : null}
                {detail.guidedExport || detail.section === "direct_social" ? (
                  <button
                    type="button"
                    disabled={zipBusy}
                    onClick={() => zipInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-md border border-ink/12 px-3 py-2 text-sm font-medium text-ink"
                  >
                    {zipBusy ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Archive className="size-3.5" aria-hidden />
                    )}
                    {t("mediaImport.uploadExportZip")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setDetail(null)}
                  className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-ink-muted hover:text-ink"
                >
                  {t("common.back")}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map(({ section, items }) => (
                <section key={section}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {sectionTitle(section, t)}
                  </h3>
                  <ul className="mt-2 space-y-1">
                    {items.map((provider) => {
                      const connected = isConnected(provider.id);
                      const badge = availabilityBadge(provider, t);
                      return (
                        <li key={provider.id}>
                          <button
                            type="button"
                            disabled={zipBusy && provider.acceptsExportZip}
                            onClick={() => chooseProvider(provider)}
                            className={cn(
                              "flex w-full items-start gap-3 rounded-md border border-ink/10 px-3 py-2.5 text-left text-sm transition hover:border-accent/35 hover:bg-accent/5",
                              provider.section === "direct_social" &&
                                "opacity-95",
                            )}
                          >
                            <span className="mt-0.5 text-ink-muted">
                              <ProviderIcon id={provider.id} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-2 font-medium text-ink">
                                {provider.label}
                                {connected ? (
                                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                                    {t("mediaImport.connected")}
                                  </span>
                                ) : null}
                                {badge ? (
                                  <span className="rounded bg-ink/8 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                                    {badge}
                                  </span>
                                ) : null}
                              </span>
                              <span className="mt-0.5 block text-xs text-ink-muted">
                                {provider.description}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {zipBusy ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("mediaImport.zipReading")}
            </p>
          ) : null}
          {zipNotice ? (
            <p className="mt-3 text-sm text-emerald-800" role="status">
              {zipNotice}
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 text-sm text-red-800" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
