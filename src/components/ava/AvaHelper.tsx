"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Loader2, Upload, X } from "lucide-react";
import { Ava } from "@/components/ava/Ava";
import { useAskAiOptional } from "@/components/assistant/AskAiContext";
import {
  useLocale,
  useTranslations,
} from "@/components/i18n/LocaleProvider";
import {
  AvaAvatarClientError,
  avaAvatarClientErrorKey,
  fileToAvaAvatarDataUrl,
} from "@/lib/ava/avatar-client";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import {
  AVA_AVATAR_PRESETS,  AVA_SCREEN_NAME_MAX,
  AVA_SCREEN_NAME_MIN,
  avaScreenNameErrorKey,
  validateAvaScreenName,
} from "@/lib/ava/setup";
import type { AvaAutoOpenReason, AvaProgress, AvaStep } from "@/lib/ava/types";
import {
  featureHrefForLegacyPlusGate,
  isAvaLegacyPlusGateStep,
  isAvaSkipViaApiStep,
  persistDismissedLegacyPlusGate,
  pickDisplayedAvaStep,
  readDismissedLegacyPlusGates,
} from "@/lib/ava/legacy-plus-gate";
import { isBetaPlanPickerEnabled } from "@/lib/billing/beta-flags";
import { cn } from "@/lib/utils";

type AvaHelperProps = {
  initialProgress: AvaProgress | null;
};

/** Never auto-open (or keep open) on flows where Ava would get in the way. */
function blocksAvaAutoOpen(pathname: string): boolean {
  return (
    pathname.startsWith("/upload") ||
    pathname.startsWith("/memories/new") ||
    pathname.startsWith("/settings")
  );
}

/** Main browsing surfaces where an idle identity nudge is appropriate. */
function allowsIdentityIdleReprompt(pathname: string): boolean {
  if (blocksAvaAutoOpen(pathname)) return false;
  if (pathname.startsWith("/sign-")) return false;
  const roots = [
    "/dashboard",
    "/media",
    "/memories",
    "/people",
    "/movies",
    "/family",
    "/documents",
    "/assistant",
  ];
  return roots.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );
}

/** Soft re-prompt after this much idle time on main pages (ms). */
const IDENTITY_IDLE_MS = 45_000;
const AVA_AUTO_OPEN_STORAGE_KEY = "fmv.ava.autoOpenReasons";

function readPersistedAutoOpenReasons(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(AVA_AUTO_OPEN_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set();
  }
}

function persistAutoOpenReason(reason: string) {
  if (typeof window === "undefined") return;
  const next = readPersistedAutoOpenReasons();
  next.add(reason);
  try {
    window.sessionStorage.setItem(
      AVA_AUTO_OPEN_STORAGE_KEY,
      JSON.stringify([...next]),
    );
  } catch {
    // Ignore quota / private-mode failures — in-memory set still applies.
  }
}

async function postAva(body: Record<string, unknown>) {
  const res = await fetch("/api/ava", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    progress?: AvaProgress;
  };
  if (!res.ok || !data.progress) {
    throw new Error(data.error || "Could not update Ava.");
  }
  return data.progress;
}

function StepExtras({
  step,
  progress,
  pending,
  onAction,
  onLocalError,
}: {
  step: AvaStep;
  progress: AvaProgress;
  pending: boolean;
  onAction: (body: Record<string, unknown>) => void;
  onLocalError: (message: string | null) => void;
}) {
  const t = useTranslations();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(progress.screenName ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(
    progress.avatarUrl ?? progress.avatarPreviewUrl ?? null,
  );
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setName(progress.screenName ?? "");
  }, [progress.screenName]);

  useEffect(() => {
    setSelectedUrl(progress.avatarUrl ?? progress.avatarPreviewUrl ?? null);
  }, [progress.avatarUrl, progress.avatarPreviewUrl]);

  if (step.inline === "screen_name") {
    return (
      <form
        className="mt-4 space-y-3"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          const validated = validateAvaScreenName(name);
          if (!validated.ok) {
            setNameError(
              t(avaScreenNameErrorKey(validated.code), {
                min: AVA_SCREEN_NAME_MIN,
                max: AVA_SCREEN_NAME_MAX,
              }),
            );
            return;
          }
          setNameError(null);
          onAction({ action: "set_screen_name", screenName: validated.value });
        }}
      >
        <label className="block text-left text-sm text-ink" htmlFor="ava-screen-name">
          <span className="mb-1.5 block text-xs font-medium text-ink-muted">
            {t("ava.screenNameLabel")}
            <span className="text-red-700" aria-hidden="true">
              {" "}
              *
            </span>
            <span className="sr-only"> ({t("common.required")})</span>
          </span>
          <input
            id="ava-screen-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError(null);
            }}
            maxLength={AVA_SCREEN_NAME_MAX}
            minLength={AVA_SCREEN_NAME_MIN}
            required
            aria-required="true"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={
              nameError ? "ava-screen-name-error" : "ava-screen-name-hint"
            }
            placeholder={t("ava.screenNamePlaceholder")}
            autoComplete="nickname"
            className="w-full rounded-lg border border-ink/15 bg-canvas px-3 py-2.5 text-sm text-ink outline-none transition focus-visible:ring-2 focus-visible:ring-accent/40"
            autoFocus
          />
        </label>
        {nameError ? (
          <p
            id="ava-screen-name-error"
            className="text-left text-xs text-red-700"
            role="alert"
          >
            {nameError}
          </p>
        ) : (
          <p id="ava-screen-name-hint" className="text-left text-xs text-ink-muted">
            {t("ava.screenNameHint", {
              min: AVA_SCREEN_NAME_MIN,
              max: AVA_SCREEN_NAME_MAX,
            })}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || name.trim().length < AVA_SCREEN_NAME_MIN}
          className="ui-btn ui-btn-primary w-full justify-center focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          {step.ctaLabel || t("ava.continue")}
        </button>
      </form>
    );
  }

  if (step.inline === "avatar") {
    const busy = pending || uploading;

    async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      onLocalError(null);
      setUploading(true);
      try {
        const dataUrl = await fileToAvaAvatarDataUrl(file);
        setSelectedUrl(dataUrl);
        onAction({ action: "set_avatar", avatarUrl: dataUrl });
      } catch (err) {
        if (err instanceof AvaAvatarClientError) {
          onLocalError(t(avaAvatarClientErrorKey(err.code)));
        } else {
          onLocalError(t("ava.couldNotUseImage"));
        }
      } finally {
        setUploading(false);
      }
    }

    return (
      <div className="mt-4 space-y-4">
        {selectedUrl ? (
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedUrl}
              alt=""
              className="size-16 rounded-full border border-ink/10 object-cover shadow-sm"
            />
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-left text-xs font-medium text-ink-muted">
            {t("ava.friendlyPresets")}
          </p>
          <ul className="grid grid-cols-6 gap-2">
            {AVA_AVATAR_PRESETS.map((preset) => {
              const label = t(preset.labelKey);
              return (
                <li key={preset.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      onLocalError(null);
                      setSelectedUrl(preset.url);
                      onAction({ action: "set_avatar", avatarUrl: preset.url });
                    }}
                    className={cn(
                      "aspect-square w-full overflow-hidden rounded-full border-2 bg-canvas-deep transition",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                      selectedUrl === preset.url
                        ? "border-accent"
                        : "border-transparent hover:border-ink/20",
                    )}
                    aria-label={t("ava.usePresetAvatar", { label })}
                    aria-pressed={selectedUrl === preset.url}
                    title={label}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={preset.url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          className="sr-only"
          aria-label={t("ava.uploadPhoto")}
          onChange={onFileChange}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="ui-btn ui-btn-secondary flex w-full items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Upload className="size-4" aria-hidden />
          )}
          {t("ava.uploadPhoto")}
        </button>
      </div>
    );
  }

  return null;
}

/**
 * Ava guided helper — warm modal + header resume icon with next-step badge.
 * Auto-opens only for first-run / quiet milestones; stays quiet after cancel.
 */
export function AvaHelper({ initialProgress }: AvaHelperProps) {
  const t = useTranslations();
  const { locale } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const askAi = useAskAiOptional();
  const { user } = useUser();
  const [progress, setProgress] = useState<AvaProgress | null>(initialProgress);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gateSwitchError, setGateSwitchError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [dismissedGates, setDismissedGates] = useState<Set<string>>(
    () => new Set(),
  );
  const [, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const shownAutoOpenRef = useRef<Set<AvaAutoOpenReason>>(new Set());
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    setMounted(true);
    setDismissedGates(readDismissedLegacyPlusGates());
    for (const reason of readPersistedAutoOpenReasons()) {
      shownAutoOpenRef.current.add(reason as AvaAutoOpenReason);
    }
  }, []);

  const tryAutoOpen = useCallback(
    (next: AvaProgress, path: string, source: string) => {
      const decision =
        Boolean(next.helperEnabled) &&
        Boolean(next.autoOpenReason || next.identityIncomplete) &&
        !blocksAvaAutoOpen(path);

      console.info("[ava.client.autoOpen]", {
        source,
        path,
        hasScreenName: Boolean(next.signals?.displayName?.trim()),
        hasAvatar: Boolean(next.signals?.imageUrl?.trim()),
        identityIncomplete: next.identityIncomplete,
        helper_step: next.activeStepId,
        autoOpenReason: next.autoOpenReason,
        autoOpenDecision: decision,
        dismissed: next.dismissed,
      });

      if (!decision) return;
      const reason = next.autoOpenReason ?? "identity_setup";
      const persisted = readPersistedAutoOpenReasons();
      if (shownAutoOpenRef.current.has(reason) || persisted.has(reason)) return;
      shownAutoOpenRef.current.add(reason);
      persistAutoOpenReason(reason);
      setOpen(true);
    },
    [],
  );

  const refresh = useCallback(
    async (opts?: { allowAutoOpen?: boolean; source?: string }) => {
      const res = await fetch("/api/ava");
      if (!res.ok) return;
      const data = (await res.json()) as { progress: AvaProgress };
      setProgress(data.progress);
      if (opts?.allowAutoOpen) {
        tryAutoOpen(data.progress, pathname, opts.source ?? "refresh");
      }
    },
    [pathname, tryAutoOpen],
  );

  // Silent refresh on navigation or locale change — hard-trigger identity when incomplete.
  useEffect(() => {
    void refresh({ allowAutoOpen: true, source: "pathname" });
  }, [pathname, locale, refresh]);

  // First paint from SSR progress.
  useEffect(() => {
    if (!initialProgress) {
      // Profile may still be loading — fetch once auth shell is up.
      void refresh({ allowAutoOpen: true, source: "mount-fetch" });
      return;
    }
    tryAutoOpen(initialProgress, pathname, "ssr-initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  /**
   * Hard entry trigger: once progress says identity is incomplete, open Ava
   * without waiting for idle. Re-runs when async refresh fills progress.
   */
  useEffect(() => {
    if (!progress?.identityIncomplete || !progress.helperEnabled) return;
    if (blocksAvaAutoOpen(pathname)) return;
    if (open) return;
    tryAutoOpen(progress, pathname, "identity-hard");
  }, [
    progress,
    progress?.identityIncomplete,
    progress?.helperEnabled,
    progress?.autoOpenReason,
    pathname,
    open,
    tryAutoOpen,
  ]);

  /** Poll quietly while waiting on a quick check / milestone. */
  useEffect(() => {
    if (!progress?.pollWhileWaiting) return;
    const id = window.setInterval(() => {
      void refresh({ allowAutoOpen: true, source: "poll" });
    }, 4000);
    return () => window.clearInterval(id);
  }, [progress?.pollWhileWaiting, refresh]);

  /**
   * Soft identity re-prompt: if still missing name/avatar and the user is idle
   * on a main page after dismissing, gently reopen Ava once per session.
   */
  useEffect(() => {
    if (!progress?.identityIncomplete || !progress.helperEnabled) return;
    if (open) return;
    if (!allowsIdentityIdleReprompt(pathname)) return;

    let timer: number | null = null;

    const clear = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const arm = () => {
      clear();
      timer = window.setTimeout(() => {
        if (shownAutoOpenRef.current.has("identity_idle")) return;
        if (readPersistedAutoOpenReasons().has("identity_idle")) return;
        if (readPersistedAutoOpenReasons().has("identity_setup")) return;
        if (blocksAvaAutoOpen(pathname)) return;
        if (!allowsIdentityIdleReprompt(pathname)) return;
        shownAutoOpenRef.current.add("identity_idle");
        persistAutoOpenReason("identity_idle");
        setError(null);
        if (progressRef.current?.dismissed) {
          // Clear soft-dismiss so resume lands on the missing identity step.
          startTransition(async () => {
            try {
              const next = await postAva({ action: "resume" });
              setProgress(next);
              setOpen(true);
              router.refresh();
            } catch {
              setOpen(true);
            }
          });
        } else {
          setOpen(true);
        }
      }, IDENTITY_IDLE_MS);
    };

    const onActivity = () => arm();
    arm();
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("scroll", onActivity, { passive: true });
    window.addEventListener("touchstart", onActivity, { passive: true });

    return () => {
      clear();
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("scroll", onActivity);
      window.removeEventListener("touchstart", onActivity);
    };
  }, [
    progress?.identityIncomplete,
    progress?.helperEnabled,
    open,
    pathname,
    router,
  ]);

  // Never keep the modal over upload / create-memory flows.
  useEffect(() => {
    if (blocksAvaAutoOpen(pathname) && open) {
      setOpen(false);
    }
  }, [pathname, open]);

  function applyProgress(next: AvaProgress, opts?: { open?: boolean }) {
    setProgress(next);
    if (opts?.open !== undefined) setOpen(opts.open);
  }

  function runAction(
    body: Record<string, unknown>,
    opts?: { openAfter?: boolean; closeAfter?: boolean },
  ) {
    setError(null);
    setPending(true);
    void (async () => {
      try {
        const next = await postAva(body);
        if (opts?.closeAfter) {
          applyProgress(next, { open: false });
        } else if (opts?.openAfter) {
          applyProgress(next, { open: true });
        } else {
          applyProgress(next);
        }
        // Keep Clerk client session in sync so Settings shows Ava saves.
        if (
          body.action === "set_screen_name" ||
          body.action === "set_avatar"
        ) {
          await user?.reload?.().catch(() => undefined);
        }
        // Fire-and-forget — awaiting refresh can leave the dialog stuck pending.
        router.refresh();
      } catch (err) {
        setError(
          err instanceof Error && err.message !== "Could not update Ava."
            ? err.message
            : t("ava.couldNotUpdate"),
        );
      } finally {
        setPending(false);
      }
    })();
  }

  function markLegacyPlusGateDismissed(stepId: string) {
    persistDismissedLegacyPlusGate(stepId);
    setDismissedGates(readDismissedLegacyPlusGates());
  }

  function dismissQuietly() {
    setError(null);
    setGateSwitchError(null);
    setOpen(false);
    const current = progressRef.current;
    const stepId = current?.activeStepId;
    // Legacy+ upgrade cards: close like X, remember for this tab only.
    // Do not skip_step (Invalid request) or call billing.
    if (isAvaLegacyPlusGateStep(stepId)) {
      markLegacyPlusGateDismissed(stepId);
      return;
    }
    // Soft-complete quiet milestones so cancel stays quiet until the next one.
    if (stepId === "photos_ready") {
      runAction(
        { action: "acknowledge", stepId: "photos_ready" },
        { closeAfter: true },
      );
      return;
    }
    if (
      stepId === "create_memory" &&
      (current?.signals.memoryCount ?? 0) > 0
    ) {
      runAction(
        { action: "acknowledge", stepId: "create_memory" },
        { closeAfter: true },
      );
      return;
    }
    if (stepId && isAvaSkipViaApiStep(stepId)) {
      runAction({ action: "skip_step", stepId }, { closeAfter: true });
    } else {
      runAction({ action: "dismiss" }, { closeAfter: true });
    }
  }

  function switchToLegacyPlus(step: AvaStep) {
    if (!isAvaLegacyPlusGateStep(step.id)) return;
    const gateId = step.id;
    setError(null);
    setGateSwitchError(null);
    setPending(true);
    void (async () => {
      try {
        const res = await fetch("/api/billing/beta-assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planSlug: "legacy" }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || t("ava.couldNotUpdate"));
        }
        markLegacyPlusGateDismissed(gateId);
        setOpen(false);
        router.push(featureHrefForLegacyPlusGate(gateId));
        router.refresh();
      } catch (err) {
        setGateSwitchError(
          err instanceof Error ? err.message : t("ava.couldNotUpdate"),
        );
      } finally {
        setPending(false);
      }
    })();
  }

  useOverlayA11y({
    open,
    onClose: dismissQuietly,
    containerRef: dialogRef,
    initialFocus: closeBtnRef,
    initialFocusSelector: "[data-ava-primary]",
  });

  function openHelper() {
    setError(null);
    setGateSwitchError(null);
    // Always resume so soft-dismiss clears and the server picks the first
    // missing identity step (welcome → name → avatar).
    if (
      progress?.dismissed ||
      !progress?.helperEnabled ||
      progress?.identityIncomplete
    ) {
      runAction({ action: "resume" }, { openAfter: true });
    } else {
      setOpen(true);
    }
  }

  // Keep Ava mounted while identity is incomplete or the dialog is open —
  // do not gate the forced Welcome flow on showHeaderIcon alone.
  if (
    !progress?.showHeaderIcon &&
    !progress?.identityIncomplete &&
    !open
  ) {
    return null;
  }

  if (!progress) {
    return null;
  }

  const active =
    progress
      ? pickDisplayedAvaStep(progress, dismissedGates)
      : null;

  const firstName = progress?.screenName?.trim().split(/\s+/)[0] || null;

  const headerButton =
    progress?.showHeaderIcon ? (
      <button
        type="button"
        onClick={openHelper}
        className={cn(
          "dashboard-icon-btn relative inline-flex items-center justify-center rounded-full border border-ink/10 bg-canvas p-0.5 text-ink-muted transition-colors",
          "hover:border-accent/35 hover:text-ink",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          open && "border-accent/35 text-accent-deep",
        )}
        aria-label={
          progress.hasRecommendedAction
            ? t("ava.openWithTip")
            : t("ava.open")
        }
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Ava size="sm" decorative />
        {progress.hasRecommendedAction ? (
          <span
            className="absolute right-0 top-0 size-2.5 rounded-full bg-accent ring-2 ring-canvas"
            aria-hidden
          />
        ) : null}
      </button>
    ) : null;

  const modal =
    mounted && open && progress
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/45 p-4 backdrop-blur-sm sm:items-center"
            role="presentation"
            onClick={dismissQuietly}
          >
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="ava-helper-title"
              aria-describedby="ava-helper-desc"
              className="relative w-full max-w-md overflow-hidden rounded-2xl border border-ink/10 bg-canvas shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                ref={closeBtnRef}
                type="button"
                onClick={dismissQuietly}
                className="absolute right-3 top-3 rounded-md p-1.5 text-ink-muted transition hover:bg-ink/5 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                aria-label={t("ava.closeForNow")}
              >
                <X className="size-4" aria-hidden />
              </button>

              <div className="px-6 pb-6 pt-8 text-center sm:px-8">
                <div className="mx-auto flex justify-center">
                  <Ava size="lg" decorative />
                </div>

                <p className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-accent-deep">
                  {t("ava.name")}
                </p>
                <h2
                  id="ava-helper-title"
                  className="mt-1 font-display text-2xl tracking-tight text-ink"
                >
                  {active?.title ||
                    (firstName
                      ? t("ava.niceWorkName", { name: firstName })
                      : t("ava.niceWork"))}
                </h2>
                <p
                  id="ava-helper-desc"
                  className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted"
                >
                  {active?.description || t("ava.idleTip")}
                </p>

                {active?.upgradeNote ? (
                  <p
                    className="mx-auto mt-3 max-w-sm rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-left text-sm leading-relaxed text-amber-950"
                    role="note"
                  >
                    {active.upgradeNote}
                  </p>
                ) : null}

                {active?.optional &&
                !isAvaLegacyPlusGateStep(active.id) ? (
                  <p className="mt-2 text-xs text-ink-muted/80">
                    {t("ava.optional")}
                  </p>
                ) : null}

                {active?.examples && active.examples.length > 0 ? (
                  <ul
                    className="mx-auto mt-4 w-full max-w-sm space-y-2 text-left"
                    aria-label={t("ava.examplesAria")}
                  >
                    {active.examples.map((example) => (
                      <li
                        key={example}
                        className="rounded-lg border border-ink/10 bg-canvas-deep/60 px-3 py-2 text-sm text-ink"
                      >
                        “{example}”
                      </li>
                    ))}
                  </ul>
                ) : null}

                {active ? (
                  <StepExtras
                    step={active}
                    progress={progress}
                    pending={pending}
                    onAction={runAction}
                    onLocalError={setError}
                  />
                ) : null}

                {error ? (
                  <p
                    className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                    role="alert"
                  >
                    {error}
                  </p>
                ) : null}

                {active &&
                active.inline !== "screen_name" &&
                active.inline !== "avatar" ? (
                  <div className="mt-6 flex flex-col gap-2">
                    {active.id === "photos_ready" && active.href ? (
                      <Link
                        href={active.href}
                        data-ava-primary
                        className="ui-btn ui-btn-primary w-full justify-center focus-visible:ring-2 focus-visible:ring-accent/40"
                        onClick={() => {
                          void postAva({
                            action: "acknowledge",
                            stepId: "photos_ready",
                          }).catch(() => undefined);
                          setOpen(false);
                        }}
                      >
                        {active.ctaLabel || t("ava.viewPhotos")}
                      </Link>
                    ) : active.id === "create_memory" &&
                      progress.signals.memoryCount > 0 &&
                      active.href ? (
                      <Link
                        href={active.href}
                        data-ava-primary
                        className="ui-btn ui-btn-primary w-full justify-center focus-visible:ring-2 focus-visible:ring-accent/40"
                        onClick={() => {
                          void postAva({
                            action: "acknowledge",
                            stepId: "create_memory",
                          }).catch(() => undefined);
                          setOpen(false);
                        }}
                      >
                        {active.ctaLabel || t("ava.viewMemories")}
                      </Link>
                    ) : active.id === "encourage_memory" && active.href ? (
                      <>
                        <Link
                          href={active.href}
                          data-ava-primary
                          className="ui-btn ui-btn-primary w-full justify-center focus-visible:ring-2 focus-visible:ring-accent/40"
                          onClick={() => {
                            void postAva({
                              action: "acknowledge",
                              stepId: "encourage_memory",
                            }).catch(() => undefined);
                            setOpen(false);
                          }}
                        >
                          {active.ctaLabel || t("ava.createMemory")}
                        </Link>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            runAction(
                              { action: "skip_step", stepId: active.id },
                              { closeAfter: true },
                            )
                          }
                          className="ui-btn ui-btn-secondary w-full justify-center focus-visible:ring-2 focus-visible:ring-accent/40"
                        >
                          {t("ava.maybeLater")}
                        </button>
                      </>
                    ) : active.inline === "acknowledge" ? (
                      <button
                        type="button"
                        data-ava-primary
                        disabled={pending}
                        onClick={() =>
                          runAction(
                            {
                              action: "acknowledge",
                              stepId: active.id,
                            },
                            active.id === "moderation"
                              ? { closeAfter: true }
                              : undefined,
                          )
                        }
                        className="ui-btn ui-btn-primary w-full justify-center focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60"
                      >
                        {pending ? (
                          <Loader2
                            className="size-4 animate-spin"
                            aria-hidden
                          />
                        ) : null}
                        {active.ctaLabel || t("ava.continue")}
                      </button>
                    ) : isAvaLegacyPlusGateStep(active.id) &&
                      active.href &&
                      active.ctaLabel ? (
                      <>
                        {isBetaPlanPickerEnabled() ? (
                          <button
                            type="button"
                            data-ava-primary
                            disabled={pending}
                            onClick={() => switchToLegacyPlus(active)}
                            className="ui-btn ui-btn-primary w-full justify-center focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60"
                          >
                            {pending ? (
                              <Loader2
                                className="size-4 animate-spin"
                                aria-hidden
                              />
                            ) : null}
                            {active.ctaLabel}
                          </button>
                        ) : (
                          <Link
                            href={active.href}
                            data-ava-primary
                            className="ui-btn ui-btn-primary w-full justify-center focus-visible:ring-2 focus-visible:ring-accent/40"
                            onClick={() => setOpen(false)}
                          >
                            {active.ctaLabel}
                          </Link>
                        )}
                        {gateSwitchError ? (
                          <p
                            className="text-sm text-red-800"
                            role="alert"
                          >
                            {gateSwitchError}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          disabled={pending}
                          onClick={dismissQuietly}
                          className="ui-btn ui-btn-secondary w-full justify-center focus-visible:ring-2 focus-visible:ring-accent/40"
                        >
                          {t("ava.maybeLater")}
                        </button>
                      </>
                    ) : active.href && active.ctaLabel ? (
                      <>
                        <Link
                          href={active.href}
                          data-ava-primary
                          className="ui-btn ui-btn-primary w-full justify-center focus-visible:ring-2 focus-visible:ring-accent/40"
                          onClick={(e) => {
                            if (
                              active.href === "/assistant" ||
                              active.href?.startsWith("/assistant")
                            ) {
                              e.preventDefault();
                              askAi?.openAskAi();
                            }
                            if (active.id === "people") {
                              void postAva({
                                action: "acknowledge",
                                stepId: active.id,
                              }).catch(() => undefined);
                            } else {
                              void postAva({
                                action: "set_step",
                                stepId: active.id,
                              }).catch(() => undefined);
                            }
                            setOpen(false);
                          }}
                        >
                          {active.ctaLabel}
                        </Link>
                        {active.optional ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              runAction(
                                {
                                  action: "skip_step",
                                  stepId: active.id,
                                },
                                { closeAfter: true },
                              )
                            }
                            className="ui-btn ui-btn-secondary w-full justify-center focus-visible:ring-2 focus-visible:ring-accent/40"
                          >
                            {t("ava.maybeLater")}
                          </button>
                        ) : null}
                      </>
                    ) : null}

                    {active.id === "moderation" ? (
                      <p className="text-xs text-ink-muted">
                        {t("ava.moderationBrowse")}
                      </p>
                    ) : null}

                    {active.optional ||
                    active.id === "encourage_memory" ||
                    (active.id === "create_memory" &&
                      progress.signals.memoryCount > 0) ? null : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={dismissQuietly}
                        className="mt-1 text-sm font-medium text-ink-muted transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-md"
                      >
                        {t("ava.notNow")}
                      </button>
                    )}
                  </div>
                ) : active?.inline === "screen_name" ||
                  active?.inline === "avatar" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={dismissQuietly}
                    className="mt-4 text-sm font-medium text-ink-muted transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-md"
                  >
                    {t("ava.notNow")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={dismissQuietly}
                    className="ui-btn ui-btn-secondary mt-6 w-full justify-center focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    {t("ava.close")}
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <AvaHeaderSlot>{headerButton}</AvaHeaderSlot>
      {modal}
    </>
  );
}

function AvaHeaderSlot({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.getElementById("ava-header-slot"));
  }, []);

  if (!target || !children) return null;
  return createPortal(children, target);
}
