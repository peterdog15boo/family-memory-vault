"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useClerk } from "@clerk/nextjs";
import { Loader2, ShieldAlert } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import {
  getActiveCriticalWorkCount,
  getCriticalWorkSnapshot,
  subscribeCriticalWork,
  type CriticalWorkSnapshot,
} from "@/lib/session/critical-activity";
import {
  broadcastIdleSync,
  inactivitySignInPath,
  readLastActivityAt,
  subscribeIdleSync,
  writeLastActivityAt,
} from "@/lib/session/idle-session-sync";
import {
  evaluateIdleState,
  IDLE_ACTIVITY_EVENTS,
  IDLE_CRITICAL_FORCE_MS,
  IDLE_LOGOUT_GRACE_MS,
  IDLE_MEDIA_INTERACTION_EVENTS,
  msUntilNextIdleCheck,
} from "@/lib/session/idle-timeout";
import type { IdleTimeoutPolicy } from "@/lib/session/idle-timeout-policy";
import { announce } from "@/lib/a11y/announce";
import { cn } from "@/lib/utils";

type Phase = "idle" | "warning" | "waiting_critical" | "signing_out";

/** Ensures only one idle dialog exists even if multiple shells mount. */
let idleDialogOwner: symbol | null = null;

function formatMmSs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type IdleWarningDialogProps = {
  titleId: string;
  descId: string;
  countdownId: string;
  phase: Phase;
  graceRemainingMs: number;
  criticalCount: number;
  signOutError: string | null;
  canDisable: boolean;
  disablePending: boolean;
  onStay: () => void;
  onDisable: () => void;
  dialogRef: React.RefObject<HTMLDivElement | null>;
};

function IdleWarningDialog({
  titleId,
  descId,
  countdownId,
  phase,
  graceRemainingMs,
  criticalCount,
  signOutError,
  canDisable,
  disablePending,
  onStay,
  onDisable,
  dialogRef,
}: IdleWarningDialogProps) {
  const t = useTranslations();
  const showCriticalWarn =
    criticalCount > 0 || phase === "waiting_critical";
  const interactive = phase === "warning" || phase === "waiting_critical";

  return (
    <div
      className="idle-session-overlay fixed inset-0 z-[120] flex items-end justify-center bg-ink/60 p-0 backdrop-blur-[3px] sm:items-center sm:p-4"
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${descId} ${countdownId}`}
        tabIndex={-1}
        className={cn(
          "idle-session-dialog flex w-full max-w-md flex-col overflow-hidden outline-none",
          "rounded-t-2xl border border-ink/10 bg-canvas shadow-2xl sm:rounded-xl",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pb-2 pt-5">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-deep">
            <ShieldAlert className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="font-display text-xl tracking-tight text-ink"
            >
              {t("session.idleTitle")}
            </h2>
            <p id={descId} className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              {phase === "waiting_critical"
                ? t("session.idleWaitingUploads")
                : phase === "signing_out"
                  ? t("session.idleSigningOut")
                  : t("session.idleBody")}
            </p>
          </div>
        </div>

        <div className="space-y-3 px-5 py-4">
          {phase === "warning" || phase === "waiting_critical" ? (
            <div
              id={countdownId}
              className="rounded-xl border border-ink/8 bg-canvas-deep px-4 py-3 text-center"
              aria-live="polite"
              aria-atomic="true"
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                {t("session.idleCountdownLabel")}
              </p>
              <p className="mt-1 font-display text-3xl tabular-nums tracking-tight text-ink">
                {formatMmSs(graceRemainingMs)}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {t("session.idleCountdownHint")}
              </p>
            </div>
          ) : (
            <span id={countdownId} className="sr-only">
              {t("session.idleSigningOut")}
            </span>
          )}

          {showCriticalWarn ? (
            <div className="space-y-2" role="status">
              <p className="rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                {phase === "waiting_critical"
                  ? t("session.idleUploadDefer", {
                      count: Math.max(1, criticalCount),
                    })
                  : t("session.idleUploadWarn")}
              </p>
              {phase === "waiting_critical" ? (
                <p className="rounded-lg border border-ink/10 bg-canvas-deep px-3 py-2 text-sm text-ink-muted">
                  {t("session.idleCriticalForce")}
                </p>
              ) : null}
            </div>
          ) : null}

          {signOutError ? (
            <p className="text-sm text-red-700" role="alert">
              {signOutError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-ink/8 px-5 py-4 sm:flex-row sm:flex-wrap sm:justify-end">
          {interactive ? (
            <>
              {canDisable ? (
                <button
                  type="button"
                  className="ui-btn ui-btn-secondary w-full sm:w-auto"
                  onClick={onDisable}
                  disabled={disablePending}
                >
                  {disablePending ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : null}
                  {t("session.idleDisable")}
                </button>
              ) : null}
              <button
                type="button"
                data-idle-confirm
                className="ui-btn ui-btn-primary w-full sm:w-auto"
                onClick={onStay}
                disabled={disablePending}
              >
                {t("session.idleStaySignedIn")}
              </button>
            </>
          ) : (
            <p className="inline-flex w-full items-center justify-center gap-2 text-sm text-ink-muted sm:w-auto">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t("session.idleSigningOut")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export type IdleSessionGuardProps = {
  /** Server-resolved policy. Defaults to always-on until loaded. */
  initialPolicy?: IdleTimeoutPolicy;
};

/**
 * Bank-style idle timeout for authenticated shells.
 * Free: always on. Paid: respects server-stored preference (default on).
 *
 * Uses lastActivityAt timestamps + resume checks so backgrounded / locked
 * tabs still enforce 15m warning and 17m logout when they wake up.
 */
export function IdleSessionGuard({ initialPolicy }: IdleSessionGuardProps) {
  const t = useTranslations();
  const { signOut } = useClerk();
  const titleId = useId();
  const descId = useId();
  const countdownId = useId();
  const ownerId = useRef(Symbol("idle-session-guard"));
  const dialogRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [policy, setPolicy] = useState<IdleTimeoutPolicy>(
    () =>
      initialPolicy ?? {
        enabled: true,
        preferenceEnabled: true,
        canDisable: false,
        planSlug: "free",
      },
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [graceRemainingMs, setGraceRemainingMs] = useState(IDLE_LOGOUT_GRACE_MS);
  const [criticalSnapshot, setCriticalSnapshot] = useState<CriticalWorkSnapshot>(
    () => getCriticalWorkSnapshot(),
  );
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [disablePending, setDisablePending] = useState(false);

  const scheduleTimerRef = useRef<number | null>(null);
  const tickTimerRef = useRef<number | null>(null);
  const forceTimerRef = useRef<number | null>(null);
  const criticalDeadlineRef = useRef<number>(0);
  const lastActivityAtRef = useRef<number>(Date.now());
  const phaseRef = useRef<Phase>("idle");
  const signingOutRef = useRef(false);
  const policyEnabledRef = useRef(policy.enabled);
  const announcedPhaseRef = useRef<Phase>("idle");

  useEffect(() => {
    if (phase === announcedPhaseRef.current) return;
    announcedPhaseRef.current = phase;
    if (phase === "warning" || phase === "waiting_critical") {
      announce(t("a11y.idleWarning"), { priority: "assertive", dedupeMs: 2_000 });
    } else if (phase === "signing_out") {
      announce(t("a11y.idleSignedOut"), { priority: "assertive", dedupeMs: 2_000 });
    }
  }, [phase, t]);

  useEffect(() => {
    setMounted(true);
    if (idleDialogOwner == null) {
      idleDialogOwner = ownerId.current;
      setIsOwner(true);
    } else if (idleDialogOwner === ownerId.current) {
      setIsOwner(true);
    }
    return () => {
      if (idleDialogOwner === ownerId.current) {
        idleDialogOwner = null;
      }
    };
  }, []);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    policyEnabledRef.current = policy.enabled;
  }, [policy.enabled]);

  useEffect(() => {
    if (initialPolicy) setPolicy(initialPolicy);
  }, [initialPolicy]);

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/settings/account");
        const data = (await res.json().catch(() => ({}))) as {
          idleTimeout?: IdleTimeoutPolicy;
        };
        if (!cancelled && data.idleTimeout) {
          setPolicy(data.idleTimeout);
        }
      } catch {
        // Keep SSR / default policy.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOwner]);

  useEffect(() => {
    if (!isOwner) return;
    return subscribeCriticalWork(setCriticalSnapshot);
  }, [isOwner]);

  const clearScheduleTimers = useCallback(() => {
    if (scheduleTimerRef.current != null) {
      window.clearTimeout(scheduleTimerRef.current);
      scheduleTimerRef.current = null;
    }
    if (tickTimerRef.current != null) {
      window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    if (forceTimerRef.current != null) {
      window.clearTimeout(forceTimerRef.current);
      forceTimerRef.current = null;
    }
  }, []);

  const setLastActivityAt = useCallback((at: number, persist: boolean) => {
    lastActivityAtRef.current = at;
    if (persist) writeLastActivityAt(at);
  }, []);

  const performSignOut = useCallback(
    async (opts?: { fromPeer?: boolean }) => {
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      clearScheduleTimers();
      setPhase("signing_out");
      setSignOutError(null);
      if (!opts?.fromPeer) {
        broadcastIdleSync({
          type: "logout",
          reason: "inactivity",
          at: Date.now(),
        });
      }
      try {
        await signOut({ redirectUrl: inactivitySignInPath() });
      } catch (err) {
        signingOutRef.current = false;
        setPhase("warning");
        setSignOutError(
          err instanceof Error ? err.message : t("session.signOutError"),
        );
      }
    },
    [signOut, t, clearScheduleTimers],
  );

  const startCriticalWait = useCallback(() => {
    clearScheduleTimers();
    setCriticalSnapshot(getCriticalWorkSnapshot());
    criticalDeadlineRef.current = Date.now() + IDLE_CRITICAL_FORCE_MS;
    setGraceRemainingMs(IDLE_CRITICAL_FORCE_MS);
    setPhase("waiting_critical");

    tickTimerRef.current = window.setInterval(() => {
      const remaining = Math.max(
        0,
        criticalDeadlineRef.current - Date.now(),
      );
      setGraceRemainingMs(remaining);
      if (remaining <= 0) {
        if (tickTimerRef.current != null) {
          window.clearInterval(tickTimerRef.current);
          tickTimerRef.current = null;
        }
        void performSignOut();
      }
    }, 250);

    forceTimerRef.current = window.setTimeout(() => {
      void performSignOut();
    }, IDLE_CRITICAL_FORCE_MS);
  }, [clearScheduleTimers, performSignOut]);

  const finishGraceOrWaitForCritical = useCallback(() => {
    if (getActiveCriticalWorkCount() > 0) {
      startCriticalWait();
      return;
    }
    void performSignOut();
  }, [performSignOut, startCriticalWait]);

  const applyWarningUi = useCallback((graceRemainingMs: number) => {
    setCriticalSnapshot(getCriticalWorkSnapshot());
    setGraceRemainingMs(graceRemainingMs);
    setPhase("warning");
  }, []);

  const scheduleNextCheckRef = useRef<() => void>(() => {});

  const checkIdleState = useCallback(() => {
    if (!policyEnabledRef.current) return;
    if (signingOutRef.current) return;

    const now = Date.now();

    if (phaseRef.current === "waiting_critical") {
      const remaining = Math.max(0, criticalDeadlineRef.current - now);
      setGraceRemainingMs(remaining);
      if (remaining <= 0) {
        void performSignOut();
      }
      return;
    }

    const decision = evaluateIdleState(lastActivityAtRef.current, now);

    if (decision.action === "none") {
      if (phaseRef.current === "warning") {
        setPhase("idle");
      }
      setGraceRemainingMs(IDLE_LOGOUT_GRACE_MS);
      scheduleNextCheckRef.current();
      return;
    }

    if (decision.action === "warn") {
      applyWarningUi(decision.graceRemainingMs);
      scheduleNextCheckRef.current();
      return;
    }

    // idle >= 17 minutes — enforce logout (timers may never have fired).
    finishGraceOrWaitForCritical();
  }, [applyWarningUi, finishGraceOrWaitForCritical, performSignOut]);

  const scheduleNextCheck = useCallback(() => {
    if (scheduleTimerRef.current != null) {
      window.clearTimeout(scheduleTimerRef.current);
      scheduleTimerRef.current = null;
    }
    if (!policyEnabledRef.current) return;
    if (signingOutRef.current) return;
    if (phaseRef.current === "waiting_critical") return;

    const delay = msUntilNextIdleCheck(lastActivityAtRef.current);
    scheduleTimerRef.current = window.setTimeout(() => {
      checkIdleState();
    }, Math.max(delay, 50));
  }, [checkIdleState]);

  scheduleNextCheckRef.current = scheduleNextCheck;

  const staySignedIn = useCallback(
    (opts?: { fromPeer?: boolean; at?: number }) => {
      const at = opts?.at ?? Date.now();
      clearScheduleTimers();
      setSignOutError(null);
      setPhase("idle");
      setLastActivityAt(at, !opts?.fromPeer);
      if (!opts?.fromPeer) {
        broadcastIdleSync({ type: "stay", at });
      }
      scheduleNextCheck();
    },
    [clearScheduleTimers, setLastActivityAt, scheduleNextCheck],
  );

  const noteActivity = useCallback(
    (opts?: { fromPeer?: boolean; at?: number }) => {
      if (!policyEnabledRef.current) return;
      if (phaseRef.current !== "idle") return;
      const at = opts?.at ?? Date.now();
      const next = Math.max(lastActivityAtRef.current, at);
      setLastActivityAt(next, !opts?.fromPeer);
      if (!opts?.fromPeer) {
        broadcastIdleSync({ type: "activity", at: next });
      }
      scheduleNextCheck();
    },
    [setLastActivityAt, scheduleNextCheck],
  );

  const checkIdleStateRef = useRef(checkIdleState);
  const noteActivityRef = useRef(noteActivity);
  const staySignedInRef = useRef(staySignedIn);
  const performSignOutRef = useRef(performSignOut);
  checkIdleStateRef.current = checkIdleState;
  noteActivityRef.current = noteActivity;
  staySignedInRef.current = staySignedIn;
  performSignOutRef.current = performSignOut;

  const disableIdleTimeout = useCallback(async () => {
    if (!policy.canDisable || disablePending) return;
    setDisablePending(true);
    setSignOutError(null);
    try {
      const res = await fetch("/api/settings/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idleTimeoutEnabled: false }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        idleTimeout?: IdleTimeoutPolicy;
      };
      if (!res.ok) {
        throw new Error(data.error || t("session.idleDisableError"));
      }
      const next = data.idleTimeout ?? {
        ...policy,
        enabled: false,
        preferenceEnabled: false,
      };
      setPolicy(next);
      policyEnabledRef.current = next.enabled;
      clearScheduleTimers();
      setPhase("idle");
      window.dispatchEvent(
        new CustomEvent("fmv:idle-timeout-policy", { detail: next }),
      );
    } catch (err) {
      setSignOutError(
        err instanceof Error ? err.message : t("session.idleDisableError"),
      );
    } finally {
      setDisablePending(false);
    }
  }, [policy, disablePending, t, clearScheduleTimers]);

  // Live updates from Settings toggle / dialog Disable.
  useEffect(() => {
    if (!isOwner) return;
    function onPolicyEvent(event: Event) {
      const detail = (event as CustomEvent<IdleTimeoutPolicy>).detail;
      if (!detail || typeof detail.enabled !== "boolean") return;
      setPolicy(detail);
      policyEnabledRef.current = detail.enabled;
      if (!detail.enabled) {
        clearScheduleTimers();
        setPhase("idle");
        return;
      }
      const now = Date.now();
      setLastActivityAt(now, true);
      setPhase("idle");
      scheduleNextCheckRef.current();
    }
    window.addEventListener("fmv:idle-timeout-policy", onPolicyEvent);
    return () => {
      window.removeEventListener("fmv:idle-timeout-policy", onPolicyEvent);
    };
  }, [isOwner, clearScheduleTimers, setLastActivityAt]);

  // Critical work finished during deferral → logout (user ignored the warning).
  useEffect(() => {
    if (phase !== "waiting_critical") return;
    if (criticalSnapshot.total <= 0) {
      void performSignOut();
    }
  }, [phase, criticalSnapshot.total, performSignOut]);

  // While warning is open, refresh remaining grace from wall-clock timestamps.
  useEffect(() => {
    if (!isOwner || !policy.enabled) return;
    if (phase !== "warning") return;

    tickTimerRef.current = window.setInterval(() => {
      const decision = evaluateIdleState(
        lastActivityAtRef.current,
        Date.now(),
      );
      if (decision.action === "warn") {
        setGraceRemainingMs(decision.graceRemainingMs);
        return;
      }
      if (decision.action === "logout") {
        checkIdleStateRef.current();
      }
    }, 250);

    return () => {
      if (tickTimerRef.current != null) {
        window.clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
    };
  }, [isOwner, policy.enabled, phase]);

  // Cross-tab: activity / stay / logout.
  useEffect(() => {
    if (!isOwner) return;
    return subscribeIdleSync((message) => {
      if (message.type === "activity") {
        if (phaseRef.current === "idle") {
          noteActivityRef.current({ fromPeer: true, at: message.at });
        } else {
          // Peer still active — treat as stay so this tab does not log out.
          staySignedInRef.current({ fromPeer: true, at: message.at });
        }
        return;
      }
      if (message.type === "stay") {
        staySignedInRef.current({ fromPeer: true, at: message.at });
        return;
      }
      if (message.type === "logout") {
        void performSignOutRef.current({ fromPeer: true });
      }
    });
  }, [isOwner]);

  // Explicit activity from Ask AI typing, etc.
  useEffect(() => {
    if (!isOwner) return;
    function onUserActivity(event: Event) {
      const detail = (event as CustomEvent<{ at?: number }>).detail;
      noteActivityRef.current({
        fromPeer: true,
        at: detail?.at ?? Date.now(),
      });
    }
    window.addEventListener("fmv:user-activity", onUserActivity);
    return () => {
      window.removeEventListener("fmv:user-activity", onUserActivity);
    };
  }, [isOwner]);

  // Init lastActivityAt + arm / disarm when preference changes.
  useEffect(() => {
    if (!isOwner) return;
    if (!policy.enabled) {
      clearScheduleTimers();
      setPhase("idle");
      return;
    }

    const now = Date.now();
    const stored = readLastActivityAt();
    if (stored != null) {
      lastActivityAtRef.current = stored;
    } else {
      setLastActivityAt(now, true);
    }

    checkIdleStateRef.current();
    scheduleNextCheckRef.current();

    return () => {
      clearScheduleTimers();
    };
  }, [isOwner, policy.enabled, clearScheduleTimers, setLastActivityAt]);

  // Activity + resume checks (visibility/focus/pageshow/online).
  useEffect(() => {
    if (!isOwner || !policy.enabled) return;

    let throttleUntil = 0;
    function onActivity() {
      if (!policyEnabledRef.current) return;
      if (phaseRef.current !== "idle") return;
      const now = Date.now();
      if (now < throttleUntil) return;
      throttleUntil = now + 1_000;
      noteActivityRef.current();
    }

    function onMediaInteraction(event: Event) {
      const target = event.target;
      if (!(target instanceof HTMLMediaElement)) return;
      onActivity();
    }

    /** Resume: recompute idle from timestamps — do NOT treat as activity. */
    function onResumeCheck() {
      if (!policyEnabledRef.current) return;
      checkIdleStateRef.current();
    }

    function onVisibility() {
      if (document.visibilityState !== "visible") return;
      onResumeCheck();
    }

    function onPageShow() {
      onResumeCheck();
    }

    for (const eventName of IDLE_ACTIVITY_EVENTS) {
      window.addEventListener(eventName, onActivity, {
        capture: true,
        passive: true,
      });
    }
    for (const eventName of IDLE_MEDIA_INTERACTION_EVENTS) {
      document.addEventListener(eventName, onMediaInteraction, true);
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onResumeCheck);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onResumeCheck);

    return () => {
      for (const eventName of IDLE_ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, onActivity, true);
      }
      for (const eventName of IDLE_MEDIA_INTERACTION_EVENTS) {
        document.removeEventListener(eventName, onMediaInteraction, true);
      }
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onResumeCheck);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onResumeCheck);
    };
  }, [isOwner, policy.enabled]);

  const dialogOpen =
    isOwner &&
    policy.enabled &&
    (phase === "warning" ||
      phase === "waiting_critical" ||
      phase === "signing_out");

  useOverlayA11y({
    open: dialogOpen,
    onClose: () => staySignedIn(),
    containerRef: dialogRef,
    escapeEnabled: phase === "warning" || phase === "waiting_critical",
    trapFocus: true,
    lockScroll: true,
    lockScrollPadding: true,
    initialFocusSelector: "[data-idle-confirm]",
  });

  if (!mounted || !dialogOpen) return null;

  return createPortal(
    <IdleWarningDialog
      titleId={titleId}
      descId={descId}
      countdownId={countdownId}
      phase={phase}
      graceRemainingMs={graceRemainingMs}
      criticalCount={criticalSnapshot.total}
      signOutError={signOutError}
      canDisable={policy.canDisable}
      disablePending={disablePending}
      onStay={() => staySignedIn()}
      onDisable={() => void disableIdleTimeout()}
      dialogRef={dialogRef}
    />,
    document.body,
  );
}
