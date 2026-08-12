"use client";

import { useEffect, useState } from "react";
import { BookHeart, Camera } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import type { JourneyTrackSnapshot } from "@/lib/gamification/photos-snapshot";
import type { JourneyTrackKind } from "@/lib/gamification/types";
import { cn } from "@/lib/utils";

type JourneyTrackCardProps = {
  initial: JourneyTrackSnapshot;
  className?: string;
  compact?: boolean;
};

export function JourneyTrackCard({
  initial,
  className,
  compact = false,
}: JourneyTrackCardProps) {
  const t = useTranslations();
  const [snap, setSnap] = useState(initial);
  const category: JourneyTrackKind = snap.category ?? "photos";

  useEffect(() => {
    setSnap(initial);
  }, [initial]);

  useEffect(() => {
    function onRefresh() {
      void fetch("/api/journey")
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { journey?: import("@/lib/gamification/types").UserJourney } | null) => {
          if (!data?.journey) return;
          const track = data.journey.tracks.find((x) => x.category === category);
          const next = track?.nextMilestone ?? null;
          setSnap({
            category,
            current: track?.current ?? 0,
            nextThreshold: next?.threshold ?? null,
            nextName: next?.title ?? null,
            nextLp: next?.lpReward ?? null,
            level: data.journey.level,
            totalLp: data.journey.totalLp,
            complete: !next,
          });
        })
        .catch(() => undefined);
    }
    window.addEventListener("fmv-journey-refresh", onRefresh);
    return () => window.removeEventListener("fmv-journey-refresh", onRefresh);
  }, [category]);

  const goal = snap.nextThreshold ?? Math.max(snap.current, 1);
  const ratio = snap.complete
    ? 1
    : Math.min(1, Math.max(0, snap.current / goal));
  const ring = 2 * Math.PI * 18;
  const dash = ring * (1 - ratio);
  const Icon = category === "memories" ? BookHeart : Camera;
  const progressKey =
    category === "memories" ? "journey.memoriesProgress" : "journey.photosProgress";
  const completeKey =
    category === "memories" ? "journey.memoriesComplete" : "journey.photosComplete";
  const fallbackKey =
    category === "memories"
      ? "journey.memoriesBadgeFallback"
      : "journey.photosBadgeFallback";
  const ariaKey =
    category === "memories" ? "journey.memoriesTrackAria" : "journey.photosTrackAria";

  return (
    <section
      className={cn(
        "journey-track photos-journey-track ui-card ui-card-elevated flex items-center gap-4",
        compact ? "px-3.5 py-3" : "px-4 py-3.5 sm:px-5",
        className,
      )}
      aria-label={t(ariaKey)}
    >
      <span className="photos-journey-ring relative inline-flex size-12 shrink-0 items-center justify-center">
        <svg viewBox="0 0 44 44" className="size-12 -rotate-90" aria-hidden>
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke="color-mix(in srgb, var(--ink) 10%, transparent)"
            strokeWidth="4"
          />
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={ring}
            strokeDashoffset={dash}
          />
        </svg>
        <Icon className="absolute size-4 text-accent-deep" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold tracking-tight text-ink">
          {snap.complete
            ? t(completeKey, { current: snap.current })
            : t(progressKey, {
                current: snap.current,
                next: snap.nextThreshold ?? snap.current,
              })}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
          {snap.complete
            ? t("journey.allCaughtUp")
            : t("journey.nextBadge", {
                name: snap.nextName ?? t(fallbackKey),
                lp: snap.nextLp ?? 0,
              })}
        </p>
        {!compact ? (
          <div
            className="photos-journey-bar mt-2 h-1.5 overflow-hidden rounded-full bg-ink/[0.08]"
            aria-hidden
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500"
              style={{ width: `${Math.round(ratio * 100)}%` }}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function PhotosJourneyTrack(props: JourneyTrackCardProps) {
  return <JourneyTrackCard {...props} />;
}
