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
import { fileToAvaAvatarDataUrl } from "@/lib/ava/avatar-client";
import {
  AVA_AVATAR_PRESETS,
  AVA_SCREEN_NAME_MAX,
  AVA_SCREEN_NAME_MIN,
  validateAvaScreenName,
} from "@/lib/ava/setup";
import type { AvaAutoOpenReason, AvaProgress, AvaStep } from "@/lib/ava/types";
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
            setNameError(validated.error);
            return;
          }
          setNameError(null);
          onAction({ action: "set_screen_name", screenName: validated.value });
        }}
      >
        <label className="block text-left text-sm text-ink">
          <span className="mb-1.5 block text-xs font-medium text-ink-muted">
            Screen name
          </span>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError(null);
            }}
            maxLength={AVA_SCREEN_NAME_MAX}
            minLength={AVA_SCREEN_NAME_MIN}
            placeholder="e.g. Jeff"
            autoComplete="nickname"
            className="w-full rounded-lg border border-ink/15 bg-canvas px-3 py-2.5 text-sm text-ink outline-none transition focus-visible:ring-2 focus-visible:ring-accent/40"
            autoFocus
          />
        </label>
        {nameError ? (
          <p className="text-left text-xs text-red-700" role="alert">
            {nameError}
          </p>
        ) : (
          <p className="text-left text-xs text-ink-muted">
            {AVA_SCREEN_NAME_MIN}–{AVA_SCREEN_NAME_MAX} characters
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
          {step.ctaLabel || "Continue"}
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
        onLocalError(
          err instanceof Error ? err.message : "Could not use that image.",
        );
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
            Friendly presets
          </p>
          <ul className="grid grid-cols-6 gap-2">
            {AVA_AVATAR_PRESETS.map((preset) => (
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
                  aria-label={`Use ${preset.label} avatar`}
                  aria-pressed={selectedUrl === preset.url}
                  title={preset.label}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preset.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          className="sr-only"
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
          Upload a photo
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
  const router = useRouter();
  const pathname = usePathname();
  const askAi = useAskAiOptional();
  const { user } = useUser();
  const [progress, setProgress] = useState<AvaProgress | null>(initialProgress);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const shownAutoOpenRef = useRef<Set<AvaAutoOpenReason>>(new Set());
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    setMounted(true);
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
      if (shownAutoOpenRef.current.has(reason)) return;
      shownAutoOpenRef.current.add(reason);
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

  // Silent refresh on navigation — hard-trigger identity when incomplete.
  useEffect(() => {
    void refresh({ allowAutoOpen: true, source: "pathname" });
  }, [pathname, refresh]);

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
        if (blocksAvaAutoOpen(pathname)) return;
        if (!allowsIdentityIdleReprompt(pathname)) return;
        shownAutoOpenRef.current.add("identity_idle");
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

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusTimer = window.setTimeout(() => {
      const root = dialogRef.current;
      if (!root) return;
      const preferred =
        root.querySelector<HTMLElement>("[data-ava-primary]") ||
        closeBtnRef.current ||
        root.querySelector<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled])',
        );
      preferred?.focus();
    }, 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissQuietly();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
    // dismissQuietly closes via latest progressRef — intentional mount-on-open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setPending(false);
      }
    })();
  }

  function dismissQuietly() {
    setOpen(false);
    const current = progressRef.current;
    const stepId = current?.activeStepId;
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
    const skippable = new Set([
      "encourage_memory",
      "create_memory",
      "people",
      "create_movie",
      "ask_ai",
      "invite",
      "documents_legacy",
    ]);
    if (stepId && skippable.has(stepId)) {
      runAction({ action: "skip_step", stepId }, { closeAfter: true });
    } else {
      runAction({ action: "dismiss" }, { closeAfter: true });
    }
  }

  function openHelper() {
    setError(null);
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
    progress?.steps.find((s) => s.id === progress.activeStepId) ??
    progress?.visibleSteps.find((s) => s.status === "active") ??
    progress?.visibleSteps.find((s) => s.status === "available") ??
    null;

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
            ? "Open Ava — she has a next tip for you"
            : "Open Ava"
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
                aria-label="Close Ava for now"
              >
                <X className="size-4" aria-hidden />
              </button>

              <div className="px-6 pb-6 pt-8 text-center sm:px-8">
                <div className="mx-auto flex justify-center">
                  <Ava size="lg" decorative />
                </div>

                <p className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-accent-deep">
                  Ava
                </p>
                <h2
                  id="ava-helper-title"
                  className="mt-1 font-display text-2xl tracking-tight text-ink"
                >
                  {active?.title ||
                    (firstName ? `Nice work, ${firstName}` : "Nice work")}
                </h2>
                <p
                  id="ava-helper-desc"
                  className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted"
                >
                  {active?.description ||
                    "I’m here in the header if you want a tip."}
                </p>

                {active?.optional ? (
                  <p className="mt-2 text-xs text-ink-muted/80">Optional</p>
                ) : null}

                {active?.examples && active.examples.length > 0 ? (
                  <ul
                    className="mx-auto mt-4 w-full max-w-sm space-y-2 text-left"
                    aria-label="Example searches"
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
                        {active.ctaLabel || "View Photos"}
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
                        {active.ctaLabel || "View Memories"}
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
                          {active.ctaLabel || "Create Memory"}
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
                          Maybe later
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
                        {active.ctaLabel || "Continue"}
                      </button>
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
                            if (
                              active.id === "people" ||
                              active.id === "documents_legacy"
                            ) {
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
                            Maybe later
                          </button>
                        ) : null}
                      </>
                    ) : null}

                    {active.id === "moderation" ? (
                      <p className="text-xs text-ink-muted">
                        Keep browsing — I’ll nudge you when Photos is ready.
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
                        Not now
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
                    Not now
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={dismissQuietly}
                    className="ui-btn ui-btn-secondary mt-6 w-full justify-center focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    Close
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
