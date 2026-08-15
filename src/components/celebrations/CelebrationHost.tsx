"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { SquirrelMascot } from "@/components/brand/SquirrelMascot";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import { useAnnounceStatus } from "@/hooks/useAnnounceStatus";
import { onCelebrate } from "@/lib/celebrations/bus";
import { mapJourneyCelebration } from "@/lib/celebrations/map-journey";
import { playCelebrationChime } from "@/lib/celebrations/sound";
import {
  CELEBRATION_SOUND_PREF_EVENT,
  type CelebrationEvent,
} from "@/lib/celebrations/types";
import type { PendingJourneyCelebration } from "@/lib/gamification/pending";
import { cn } from "@/lib/utils";

const POLL_MS = 14_000;
const TOAST_MS = 4800;

function microToastKey(track: CelebrationEvent["track"]) {
  if (track === "memories") return "journey.toastMemoryReady";
  if (track === "family") return "journey.toastFamilyReady";
  if (track === "legacy") return "journey.toastLegacyReady";
  return "journey.toastPhotoReady";
}

function emitJourneySignals(event: CelebrationEvent) {
  window.dispatchEvent(new Event("fmv-journey-refresh"));
  if (event.newLevel > event.previousLevel) {
    window.dispatchEvent(
      new CustomEvent("fmv-journey-levelup", {
        detail: { level: event.newLevel },
      }),
    );
  }
}

/**
 * App-wide celebration listener: optimistic events + pending poll.
 * Full moments are rare; everything else is a quiet toast.
 */
export function CelebrationHost() {
  const t = useTranslations();
  const [mounted, setMounted] = useState(false);
  const [active, setActive] = useState<CelebrationEvent | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useAnnounceStatus(toast, { priority: "polite" });
  const [burst, setBurst] = useState(0);
  const [lpDisplay, setLpDisplay] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  const seen = useRef(new Set<string>());
  const queue = useRef<CelebrationEvent[]>([]);
  const soundOn = useRef(false);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSoundPref() {
      try {
        const res = await fetch("/api/settings/account");
        if (!res.ok) return;
        const data = (await res.json()) as {
          preferences?: { celebrationSoundEnabled?: boolean };
        };
        if (!cancelled && typeof data.preferences?.celebrationSoundEnabled === "boolean") {
          soundOn.current = data.preferences.celebrationSoundEnabled;
        }
      } catch {
        /* muted by default */
      }
    }
    void loadSoundPref();
    function onPref(e: Event) {
      const enabled = (e as CustomEvent<{ enabled?: boolean }>).detail?.enabled;
      if (typeof enabled === "boolean") soundOn.current = enabled;
    }
    window.addEventListener(CELEBRATION_SOUND_PREF_EVENT, onPref);
    return () => {
      cancelled = true;
      window.removeEventListener(CELEBRATION_SOUND_PREF_EVENT, onPref);
    };
  }, []);

  const showToast = useCallback((event: CelebrationEvent) => {
    const label = event.title
      ? t("journey.toastUnlocked", { name: event.title, lp: event.lpGained })
      : t(microToastKey(event.track), { lp: event.lpGained });
    setToast(label);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
    emitJourneySignals(event);
  }, [t]);

  const present = useCallback(
    (event: CelebrationEvent) => {
      if (seen.current.has(event.fingerprint) || seen.current.has(event.id)) {
        return;
      }
      seen.current.add(event.fingerprint);
      seen.current.add(event.id);

      if (event.presentation === "micro") {
        showToast(event);
        if (event.notificationId) {
          void fetch("/api/journey/pending", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notificationId: event.notificationId }),
          }).catch(() => undefined);
        }
        return;
      }

      setActive((current) => {
        if (!current) return event;
        queue.current.push(event);
        return current;
      });
    },
    [showToast],
  );

  useEffect(() => {
    return onCelebrate(present);
  }, [present]);

  const poll = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    try {
      const res = await fetch("/api/journey/pending");
      if (!res.ok) return;
      const data = (await res.json()) as {
        pending: PendingJourneyCelebration | null;
      };
      if (!data.pending) return;
      present(
        mapJourneyCelebration(data.pending.celebration, data.pending.notificationId),
      );
    } catch {
      /* swallow */
    }
  }, [present]);

  useEffect(() => {
    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    function onVisible() {
      if (document.visibilityState === "visible") void poll();
    }
    function onCheck() {
      void poll();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("fmv-journey-check", onCheck);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("fmv-journey-check", onCheck);
    };
  }, [poll]);

  useEffect(() => {
    if (!active) return;
    setBurst((n) => n + 1);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (active.effects.sound && soundOn.current && !reduceMotion) {
      playCelebrationChime();
    }
    if (!active.effects.lpCount || reduceMotion) {
      setLpDisplay(active.lpGained);
      return;
    }
    setLpDisplay(0);
    const target = active.lpGained;
    const started = performance.now();
    const duration = 900;
    let frame = 0;
    function tick(now: number) {
      const p = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - p) ** 3;
      setLpDisplay(Math.round(target * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  async function dismiss() {
    if (!active) return;
    const shown = active;
    setActive(null);
    emitJourneySignals(shown);
    if (shown.notificationId) {
      try {
        await fetch("/api/journey/pending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notificationId: shown.notificationId }),
        });
      } catch {
        /* swallow */
      }
    }
    const next = queue.current.shift();
    if (next) {
      window.setTimeout(() => setActive(next), 500);
    }
  }

  useOverlayA11y({
    open: Boolean(active),
    onClose: () => {
      void dismiss();
    },
    containerRef: sheetRef,
  });

  if (!mounted) return null;

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const badgeTitle = active?.title || t("journey.levelUp");

  return createPortal(
    <>
      {active ? (
        <div className="journey-celebration-root" role="presentation">
          {active.effects.confetti && !reduceMotion ? (
            <ConfettiBurst key={burst} />
          ) : null}
          <div
            className="journey-celebration-backdrop"
            onClick={() => void dismiss()}
          />
          <div
            ref={sheetRef}
            className="journey-celebration-sheet celebration-sheet-calm"
            role="dialog"
            aria-modal="true"
            aria-label={t("journey.celebrationAria")}
            tabIndex={-1}
          >
            <button
              type="button"
              className="journey-celebration-close"
              onClick={() => void dismiss()}
              aria-label={t("journey.close")}
            >
              <X className="size-4" aria-hidden />
            </button>
            <div className="flex flex-col items-center text-center">
              <SquirrelMascot
                size="lg"
                decorative={false}
                title={t("journey.mascotTitle")}
              />
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-accent-deep">
                {active.newLevel > active.previousLevel
                  ? t("journey.levelUp")
                  : t("journey.badgeUnlocked")}
              </p>
              <h2
                className={cn(
                  "font-display mt-1 text-2xl tracking-tight text-ink sm:text-[1.75rem]",
                  active.effects.badgeReveal && !reduceMotion && "celebration-badge-reveal",
                )}
              >
                {badgeTitle}
              </h2>
              <p className="mt-2 max-w-sm text-base leading-relaxed text-ink-muted">
                {active.body || t("journey.levelUpBody")}
              </p>
              {active.lpGained > 0 ? (
                <p className="celebration-lp-pill mt-4 inline-flex items-center rounded-full bg-accent-soft px-3 py-1 text-base font-semibold tabular-nums text-accent-deep">
                  {t("journey.lpEarned", { lp: lpDisplay })}
                </p>
              ) : null}
              {active.nextGoal ? (
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                  {t("journey.nextBadge", {
                    name: active.nextGoal.title,
                    lp: active.nextGoal.lpReward,
                  })}
                </p>
              ) : (
                <p className="mt-3 text-sm text-ink-muted">
                  {t("journey.allCaughtUp")}
                </p>
              )}
              <button
                type="button"
                className="ui-btn ui-btn-primary mt-5 min-h-11 px-6 text-base"
                onClick={() => void dismiss()}
              >
                {t("journey.keepGoing")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className={cn("journey-toast")} role="status">
          {toast}
        </div>
      ) : null}
    </>,
    document.body,
  );
}

function ConfettiBurst() {
  const bits = Array.from({ length: 18 }, (_, i) => i);
  return (
    <div className="journey-confetti" aria-hidden>
      {bits.map((i) => (
        <span
          key={i}
          className="journey-confetti-bit"
          style={{
            left: `${(i * 41) % 100}%`,
            animationDelay: `${(i % 7) * 0.06}s`,
            animationDuration: `${2 + (i % 4) * 0.2}s`,
            background:
              i % 3 === 0
                ? "var(--accent)"
                : i % 3 === 1
                  ? "#c9a66a"
                  : "color-mix(in srgb, var(--accent-deep) 70%, #fff)",
          }}
        />
      ))}
    </div>
  );
}
