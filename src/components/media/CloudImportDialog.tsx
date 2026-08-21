"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import { userFacingApiError } from "@/lib/http/user-messages";
import { cn } from "@/lib/utils";

type RemoteFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
};

type CloudImportDialogProps = {
  open: boolean;
  provider: "google_drive" | "dropbox";
  attachMemoryId?: string | null;
  onClose: () => void;
  onImported?: (mediaIds: string[]) => void;
};

export function CloudImportDialog({
  open,
  provider,
  attachMemoryId = null,
  onClose,
  onImported,
}: CloudImportDialogProps) {
  const t = useTranslations();
  const containerRef = useRef<HTMLDivElement>(null);
  const [files, setFiles] = useState<RemoteFile[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useOverlayA11y({
    open,
    onClose,
    containerRef,
  });

  const load = useCallback(
    async (pageToken?: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ provider });
        if (pageToken) params.set("pageToken", pageToken);
        const res = await fetch(`/api/media/import/browse?${params}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            userFacingApiError(body, t("mediaImport.browseError")),
          );
        }
        const nextFiles = (body.files ?? []) as RemoteFile[];
        setFiles((prev) => (pageToken ? [...prev, ...nextFiles] : nextFiles));
        setNextPageToken(body.nextPageToken ?? null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("mediaImport.browseError"),
        );
      } finally {
        setLoading(false);
      }
    },
    [provider, t],
  );

  useEffect(() => {
    if (!open) return;
    setFiles([]);
    setSelected([]);
    setNextPageToken(null);
    setNotice(null);
    void load(null);
  }, [open, load]);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function importSelected() {
    if (selected.length === 0) return;
    setImporting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/media/import/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          fileIds: selected,
          attachMemoryId,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          userFacingApiError(body, t("mediaImport.importError")),
        );
      }
      const mediaIds = (
        (body.imported ?? []) as Array<{ mediaId: string }>
      ).map((row) => row.mediaId);
      const failCount = Array.isArray(body.failures) ? body.failures.length : 0;
      setNotice(
        failCount > 0
          ? t("mediaImport.importPartial", {
              ok: mediaIds.length,
              fail: failCount,
            })
          : t("mediaImport.importQueued", { count: mediaIds.length }),
      );
      onImported?.(mediaIds);
      setSelected([]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("mediaImport.importError"),
      );
    } finally {
      setImporting(false);
    }
  }

  if (!open) return null;

  const title =
    provider === "google_drive"
      ? t("mediaImport.pickDrive")
      : t("mediaImport.pickDropbox");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-import-title"
        tabIndex={-1}
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-xl border border-ink/12 bg-canvas shadow-xl sm:rounded-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-ink/8 px-4 py-3">
          <h2 id="cloud-import-title" className="font-display text-lg text-ink">
            {title}
          </h2>
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
          <p className="mb-3 text-sm text-ink-muted">
            {attachMemoryId
              ? t("mediaImport.attachHint")
              : t("mediaImport.libraryHint")}
          </p>

          {loading && files.length === 0 ? (
            <div className="flex items-center gap-2 py-10 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("common.loading")}
            </div>
          ) : files.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">
              {t("mediaImport.emptyRemote")}
            </p>
          ) : (
            <ul className="space-y-1">
              {files.map((file) => {
                const checked = selected.includes(file.id);
                return (
                  <li key={file.id}>
                    <button
                      type="button"
                      onClick={() => toggle(file.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm transition",
                        checked
                          ? "border-accent bg-accent/10"
                          : "border-ink/10 hover:border-accent/30",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-5 items-center justify-center rounded-full border",
                          checked
                            ? "border-accent bg-accent text-accent-foreground"
                            : "border-ink/20",
                        )}
                      >
                        {checked ? (
                          <Check className="size-3" aria-hidden />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium text-ink">
                        {file.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {nextPageToken ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => void load(nextPageToken)}
              className="mt-3 text-sm font-medium text-accent hover:underline"
            >
              {t("common.loadMore")}
            </button>
          ) : null}

          {error ? (
            <p className="mt-3 text-sm text-red-800" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="mt-3 text-sm text-emerald-800" role="status">
              {notice}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink/8 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="ui-btn ui-btn-ghost"
          >
            {t("common.close")}
          </button>
          <button
            type="button"
            disabled={importing || selected.length === 0}
            onClick={() => void importSelected()}
            className="ui-btn ui-btn-primary"
          >
            {importing ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            {t("mediaImport.importSelected", { count: selected.length })}
          </button>
        </div>
      </div>
    </div>
  );
}
