"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Unplug } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { userFacingApiError } from "@/lib/http/user-messages";
import type { MediaConnectionPublic } from "@/lib/media/import/types";

const PROVIDER_LABELS: Record<string, string> = {
  google_drive: "Google Drive",
  dropbox: "Dropbox",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
};

export function MediaConnectionsSettings() {
  const t = useTranslations();
  const [connections, setConnections] = useState<MediaConnectionPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/media/connections");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(userFacingApiError(body, t("mediaImport.loadError")));
      }
      setConnections(body.connections ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("mediaImport.loadError"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function disconnect(connectionId: string) {
    setBusyId(connectionId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/media/connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(userFacingApiError(body, t("common.errorGeneric")));
      }
      setNotice(t("mediaImport.disconnected"));
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("common.errorGeneric"),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-xl border border-ink/10 bg-canvas/80 p-5">
      <h2 className="font-display text-lg text-ink">
        {t("mediaImport.connectionsTitle")}
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        {t("mediaImport.connectionsBody")}
      </p>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t("common.loading")}
        </div>
      ) : connections.length === 0 ? (
        <p className="mt-4 text-sm text-ink-muted">
          {t("mediaImport.noConnections")}
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {connections.map((conn) => (
            <li
              key={conn.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-ink/10 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-ink">
                  {PROVIDER_LABELS[conn.provider] ?? conn.provider}
                </p>
                <p className="text-xs text-ink-muted">
                  {conn.accountLabel || conn.externalAccountId || conn.status}
                </p>
              </div>
              <button
                type="button"
                disabled={busyId === conn.id}
                onClick={() => void disconnect(conn.id)}
                className="inline-flex items-center gap-1.5 rounded-md border border-ink/12 px-2.5 py-1.5 text-xs font-medium text-ink transition hover:border-red-300 hover:bg-red-50 hover:text-red-900"
              >
                {busyId === conn.id ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Unplug className="size-3.5" aria-hidden />
                )}
                {t("mediaImport.disconnect")}
              </button>
            </li>
          ))}
        </ul>
      )}

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
    </section>
  );
}
