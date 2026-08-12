"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Smartphone } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import {
  deleteSubscriptionOnServer,
  fetchPushConfig,
  isPushSupported,
  saveSubscriptionToServer,
  subscribeBrowserPush,
  unsubscribeBrowserPush,
} from "@/lib/push/browser";
import { cn } from "@/lib/utils";

type PushUiState =
  | "loading"
  | "unsupported"
  | "insecure"
  | "not_configured"
  | "denied"
  | "off"
  | "on"
  | "error";

export function BrowserPushSettings() {
  const t = useTranslations();
  const [state, setState] = useState<PushUiState>("loading");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!window.isSecureContext) {
      setState("insecure");
      return;
    }
    if (!isPushSupported()) {
      setState("unsupported");
      return;
    }

    try {
      const config = await fetchPushConfig();
      if (!config.configured || !config.publicKey) {
        setState("not_configured");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const { getExistingPushSubscription } = await import(
        "@/lib/push/browser"
      );
      const sub = await getExistingPushSubscription();
      if (sub && Notification.permission === "granted") {
        await saveSubscriptionToServer(sub);
        setState("on");
        return;
      }
      setState("off");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function enable() {
    setBusy(true);
    try {
      const config = await fetchPushConfig();
      if (!config.configured || !config.publicKey) {
        setState("not_configured");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const sub = await subscribeBrowserPush(config.publicKey);
      await saveSubscriptionToServer(sub);
      setState("on");
    } catch {
      setState("error");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const endpoint = await unsubscribeBrowserPush();
      if (endpoint) await deleteSubscriptionOnServer(endpoint);
      setState("off");
    } catch {
      setState("error");
    } finally {
      setBusy(false);
    }
  }

  const help =
    state === "unsupported"
      ? t("settings.browserPushUnsupported")
      : state === "insecure"
        ? t("settings.browserPushInsecure")
        : state === "not_configured"
          ? t("settings.browserPushNotConfigured")
          : state === "denied"
            ? t("settings.browserPushDenied")
            : state === "error"
              ? t("settings.browserPushError")
              : t("settings.browserPushHelp");

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-ink-muted">{help}</p>
      {state === "loading" ? (
        <p className="inline-flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {t("settings.saving")}
        </p>
      ) : null}
      {state === "off" || state === "error" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void enable()}
          className={cn(
            "inline-flex items-center gap-2 rounded-md border border-ink/12 bg-canvas px-3 py-2 text-sm font-medium text-ink",
            "transition-colors hover:border-ink/20 hover:bg-[color:var(--canvas-deep)]/40",
            busy && "opacity-70",
          )}
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <Smartphone className="size-3.5" aria-hidden />
          )}
          {t("settings.browserPushEnable")}
        </button>
      ) : null}
      {state === "on" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-medium text-[color:var(--accent-deep)]">
            {t("settings.browserPushOn")}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void disable()}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border border-ink/12 bg-canvas px-3 py-2 text-sm font-medium text-ink-muted",
              "transition-colors hover:border-ink/20 hover:text-ink",
              busy && "opacity-70",
            )}
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : null}
            {t("settings.browserPushDisable")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
