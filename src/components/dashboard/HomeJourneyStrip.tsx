"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { LegacyJourneyCard } from "@/components/gamification/LegacyJourneyCard";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import type { FamilyCompletenessSnapshot } from "@/lib/completeness/family-completeness";
import type { JourneyBoardSnapshot } from "@/lib/gamification/journey-board";
import { cn } from "@/lib/utils";

type HomeJourneyStripProps = {
  board: JourneyBoardSnapshot;
  /** Compact checkmarks for first-wins; click still opens journey details. */
  completeness?: FamilyCompletenessSnapshot | null;
};

function trackCurrent(
  board: JourneyBoardSnapshot,
  category: "photos" | "memories",
): number {
  return board.tracks.find((track) => track.category === category)?.current ?? 0;
}

/**
 * Compact horizontal progress: journey numbers + completeness checks.
 * Click opens the existing Legacy Journey card in a portaled dialog.
 */
export function HomeJourneyStrip({
  board,
  completeness = null,
}: HomeJourneyStripProps) {
  const t = useTranslations();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const photos = trackCurrent(board, "photos");
  const memories = trackCurrent(board, "memories");
  const badges = board.recentBadges.length;
  const stepZero = board.level <= 1 && board.totalLp === 0 && photos === 0;

  useEffect(() => {
    setMounted(true);
  }, []);

  useOverlayA11y({
    open,
    onClose: () => setOpen(false),
    containerRef: dialogRef,
    initialFocus: "container",
  });

  const stats = [
    {
      value: photos,
      label: t("dashboard.journeyStatPhotos"),
    },
    {
      value: board.level,
      label: t("dashboard.journeyStatLevel"),
    },
    {
      value: badges,
      label: t("dashboard.journeyStatBadges"),
    },
    {
      value: memories,
      label: t("dashboard.journeyStatMemories"),
    },
  ];

  function closeDialog() {
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="home-panel home-journey-strip"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("dashboard.journeyStripAria")}
      >
        <div className="home-journey-strip-main">
          {completeness ? (
            <ul className="home-completeness-checks" aria-label={t("completeness.title")}>
              {completeness.items.map((item) => (
                <li key={item.id}>
                  <span
                    className={cn(
                      "home-completeness-check",
                      item.done && "home-completeness-check--done",
                    )}
                    title={t(`completeness.item.${item.id}`)}
                  >
                    {item.done ? (
                      <Check className="size-3.5" aria-hidden />
                    ) : null}
                    <span className="home-completeness-check-label">
                      {t(`completeness.item.${item.id}`)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {stepZero ? (
            <p className="home-journey-zero">{t("dashboard.journeyStepZero")}</p>
          ) : (
            <ul className="home-journey-stats">
              {stats.map((stat) => (
                <li key={stat.label}>
                  <span
                    className="home-journey-stat-value"
                    aria-label={t("dashboard.journeyStatValueAria", {
                      label: stat.label,
                      value: stat.value,
                    })}
                  >
                    {stat.value}
                  </span>
                  <span className="home-journey-stat-label" aria-hidden>
                    {stat.label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <span className="home-journey-hint">{t("dashboard.journeyStripHint")}</span>
      </button>

      {mounted && open
        ? createPortal(
            <div
              ref={dialogRef}
              data-app-portal=""
              className="home-journey-overlay"
              role="dialog"
              aria-modal="true"
              aria-labelledby="home-journey-dialog-title"
              tabIndex={-1}
              onClick={(event) => {
                if (event.target === event.currentTarget) closeDialog();
              }}
            >
              <div
                className="home-journey-dialog"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="home-journey-dialog-bar">
                  <h2
                    id="home-journey-dialog-title"
                    className="home-journey-dialog-title"
                  >
                    {t("journey.boardEyebrow")}
                  </h2>
                  <button
                    type="button"
                    className="home-journey-dialog-close"
                    onClick={closeDialog}
                    aria-label={t("common.close")}
                  >
                    <X className="size-5" aria-hidden />
                  </button>
                </div>
                <LegacyJourneyCard initial={board} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
