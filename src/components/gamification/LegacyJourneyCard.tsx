"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookHeart,
  Camera,
  Heart,
  Shield,
  Users,
} from "lucide-react";
import { SquirrelMascot } from "@/components/brand/SquirrelMascot";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import type { JourneyBoardSnapshot } from "@/lib/gamification/journey-board";
import { journeyBoardFromJourney } from "@/lib/gamification/journey-board";
import type { JourneyTrackKind, UserJourney } from "@/lib/gamification/types";
import { cn } from "@/lib/utils";

const SEEN_LEVEL_KEY = "fmv-journey-seen-level";

const TRACK_ICONS = {
  photos: Camera,
  memories: BookHeart,
  family: Users,
  legacy: Shield,
} as const;

type LegacyJourneyCardProps = {
  initial: JourneyBoardSnapshot;
  className?: string;
};

export function LegacyJourneyCard({
  initial,
  className,
}: LegacyJourneyCardProps) {
  const t = useTranslations();
  const [board, setBoard] = useState(initial);
  const [levelPulse, setLevelPulse] = useState(false);
  const pulseTimer = useRef<number | null>(null);

  function rememberLevel(level: number) {
    try {
      sessionStorage.setItem(SEEN_LEVEL_KEY, String(level));
    } catch {
      /* private mode */
    }
  }

  function playLevelUp(level?: number) {
    if (typeof level === "number") rememberLevel(level);
    setLevelPulse(true);
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setLevelPulse(false), 1800);
  }

  useEffect(() => {
    setBoard(initial);
  }, [initial]);

  useEffect(() => {
    try {
      const prev = Number(sessionStorage.getItem(SEEN_LEVEL_KEY) || "0");
      if (prev > 0 && board.level > prev) playLevelUp(board.level);
      else rememberLevel(board.level);
    } catch {
      /* private mode */
    }
  }, [board.level]);

  useEffect(() => {
    function onLevelUp(event: Event) {
      const detail = (event as CustomEvent<{ level?: number }>).detail;
      playLevelUp(detail?.level);
    }

    function onRefresh() {
      void fetch("/api/journey")
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { journey?: UserJourney } | null) => {
          if (!data?.journey) return;
          setBoard(journeyBoardFromJourney(data.journey));
        })
        .catch(() => undefined);
    }

    window.addEventListener("fmv-journey-levelup", onLevelUp);
    window.addEventListener("fmv-journey-refresh", onRefresh);
    return () => {
      window.removeEventListener("fmv-journey-levelup", onLevelUp);
      window.removeEventListener("fmv-journey-refresh", onRefresh);
      if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    };
  }, []);

  const lpRatio =
    board.lpPerLevel > 0
      ? Math.min(1, board.lpInLevel / board.lpPerLevel)
      : 1;
  const action = board.nextAction;
  const actionLabel = action ? nextActionLabel(t, action) : t("journey.boardAllCaughtUp");

  return (
    <section
      className={cn(
        "legacy-journey-card ui-card ui-card-elevated",
        levelPulse && "legacy-journey-card-levelup",
        className,
      )}
      aria-label={t("journey.boardAria")}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <SquirrelMascot size="sm" className="mt-0.5 hidden sm:inline-flex" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-deep">
            {t("journey.boardEyebrow")}
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h2 className="font-display text-xl tracking-tight text-ink sm:text-2xl">
              {t("journey.boardLevelName", {
                title: board.levelTitle,
                level: board.level,
              })}
            </h2>
            {levelPulse ? (
              <span className="legacy-journey-level-chip">
                {t("journey.levelUp")}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {t("journey.boardTotalLp", { lp: board.totalLp })}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-ink-muted">
          <span>{t("journey.boardLpInLevel", { lp: board.lpInLevel, max: board.lpPerLevel })}</span>
          <span>
            {board.lpToNext > 0
              ? t("journey.boardLpToNext", {
                  lp: board.lpToNext,
                  level: board.level + 1,
                })
              : t("journey.boardLevelMaxed")}
          </span>
        </div>
        <div
          className="legacy-journey-lp-bar mt-1.5 h-2 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={board.lpPerLevel}
          aria-valuenow={board.lpInLevel}
          aria-label={t("journey.boardLpBarAria")}
        >
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-700"
            style={{ width: `${Math.round(lpRatio * 100)}%` }}
          />
        </div>
      </div>

      <ul className="legacy-journey-tracks mt-5 grid grid-cols-4 gap-2 sm:gap-3">
        {board.tracks.map((track) => (
          <li key={track.category}>
            <MiniTrackRing track={track} />
          </li>
        ))}
      </ul>

      {board.recentBadges.length > 0 ? (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted">
            {t("journey.boardRecentBadges")}
          </p>
          <ul className="legacy-journey-badges mt-2 flex gap-2 overflow-x-auto pb-1">
            {board.recentBadges.map((badge) => (
              <li key={badge.id} className="shrink-0">
                <span className="legacy-journey-badge" title={badge.title}>
                  <BadgeGlyph category={badge.category} />
                  <span className="max-w-[7.5rem] truncate">{badge.title}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-5 border-t border-ink/8 pt-4">
        {action ? (
          <Link
            href={action.href}
            className="group flex items-start gap-2 text-sm leading-relaxed text-ink"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold uppercase tracking-[0.1em] text-accent-deep">
                {t("journey.boardNext")}
              </span>
              <span className="mt-0.5 block">{actionLabel}</span>
            </span>
            <ArrowRight
              className="mt-4 size-4 shrink-0 text-accent-deep transition group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        ) : (
          <p className="text-sm text-ink-muted">{actionLabel}</p>
        )}
      </div>
    </section>
  );
}

function MiniTrackRing({
  track,
}: {
  track: JourneyBoardSnapshot["tracks"][number];
}) {
  const t = useTranslations();
  const Icon = TRACK_ICONS[track.category];
  const ring = 2 * Math.PI * 16;
  const dash = ring * (1 - track.ratio);
  const value =
    track.unit === "percent"
      ? `${Math.round(track.current)}%`
      : track.nextThreshold
        ? `${track.current}/${track.nextThreshold}`
        : String(track.current);

  return (
    <Link
      href={track.href}
      className="legacy-journey-mini flex flex-col items-center gap-1.5 rounded-xl px-0.5 py-1 text-center transition hover:bg-accent/5"
      aria-label={t("journey.boardTrackAria", {
        name: trackLabel(t, track.category, track.label),
        value,
      })}
    >
      <span className="relative inline-flex size-11 items-center justify-center">
        <svg viewBox="0 0 40 40" className="size-11 -rotate-90" aria-hidden>
          <circle
            cx="20"
            cy="20"
            r="16"
            fill="none"
            stroke="color-mix(in srgb, var(--ink) 10%, transparent)"
            strokeWidth="3.5"
          />
          <circle
            cx="20"
            cy="20"
            r="16"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={ring}
            strokeDashoffset={dash}
          />
        </svg>
        <Icon className="absolute size-3.5 text-accent-deep" aria-hidden />
      </span>
      <span className="text-[11px] font-medium leading-tight text-ink">
        {trackLabel(t, track.category, track.label)}
      </span>
      <span className="text-[10px] tabular-nums text-ink-muted">{value}</span>
    </Link>
  );
}

function BadgeGlyph({ category }: { category: JourneyTrackKind }) {
  const Icon = category === "legacy" ? Heart : TRACK_ICONS[category];
  return (
    <span className="legacy-journey-badge-glyph" aria-hidden>
      <Icon className="size-3.5" />
    </span>
  );
}

function trackLabel(
  t: (key: string) => string,
  category: JourneyTrackKind,
  fallback: string,
) {
  const key = `journey.track.${category}`;
  const value = t(key);
  return value === key ? fallback : value;
}

function nextActionLabel(
  t: (key: string, values?: Record<string, string | number>) => string,
  action: NonNullable<JourneyBoardSnapshot["nextAction"]>,
) {
  if (action.kind === "legacy") {
    return t("journey.actionLegacy", {
      threshold: action.threshold,
      name: action.badgeTitle,
    });
  }
  if (action.kind === "family_invite") {
    return t("journey.actionFamilyInvite", { name: action.badgeTitle });
  }
  if (action.kind === "family_builder") {
    return t("journey.actionFamilyBuilder", {
      count: Math.max(1, action.remaining),
      name: action.badgeTitle,
    });
  }
  if (action.kind === "family_circle") {
    return t("journey.actionFamilyCircle", {
      count: Math.max(1, action.remaining),
      name: action.badgeTitle,
    });
  }
  if (action.kind === "memories") {
    return action.current === 0 && action.threshold === 1
      ? t("journey.actionMemoriesFirst", { name: action.badgeTitle })
      : t("journey.actionMemories", {
          count: Math.max(1, action.remaining),
          name: action.badgeTitle,
        });
  }
  return action.current === 0 && action.threshold === 1
    ? t("journey.actionPhotosFirst", { name: action.badgeTitle })
    : t("journey.actionPhotos", {
        count: Math.max(1, action.remaining),
        name: action.badgeTitle,
      });
}
