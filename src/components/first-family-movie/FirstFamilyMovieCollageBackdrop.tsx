"use client";

import { useMemo } from "react";
import { buildFirstFamilyMovieCollage } from "@/content/first-family-movie-collage";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** Slightly stronger veil for dialog steps (upload / wait). */
  denserVeil?: boolean;
};

/**
 * Full-bleed mosaic that slowly pans left in a seamless loop.
 * Mount once for the ritual so motion never resets between steps.
 */
export function FirstFamilyMovieCollageBackdrop({
  className,
  denserVeil = false,
}: Props) {
  // Fixed count keeps the dual-panel loop seamless (no remount on resize).
  const tiles = useMemo(() => buildFirstFamilyMovieCollage(36), []);

  return (
    <div
      className={cn(
        "ffm-collage-backdrop pointer-events-none absolute inset-0",
        className,
      )}
      aria-hidden
    >
      <div className="ffm-collage-viewport">
        <div className="ffm-collage-track">
          <CollagePanel tiles={tiles} />
          <CollagePanel tiles={tiles} duplicate />
        </div>
      </div>
      <div
        className={cn(
          "ffm-collage-veil absolute inset-0",
          denserVeil && "ffm-collage-veil--dense",
        )}
      />
    </div>
  );
}

function CollagePanel({
  tiles,
  duplicate = false,
}: {
  tiles: ReturnType<typeof buildFirstFamilyMovieCollage>;
  duplicate?: boolean;
}) {
  return (
    <div className="ffm-collage-panel">
      <div className="ffm-welcome-mosaic-grid ffm-collage-grid">
        {tiles.map((tile, i) => (
          <div
            key={`${duplicate ? "b" : "a"}-${tile.src}-${i}`}
            className={cn(
              "ffm-welcome-tile",
              !duplicate && "ffm-welcome-tile--enter",
              duplicate && "ffm-welcome-tile--static",
              tile.span === "wide" && "ffm-welcome-tile--wide",
              tile.span === "tall" && "ffm-welcome-tile--tall",
            )}
            style={{
              backgroundImage: `url(${tile.src})`,
              backgroundPosition: tile.focus ?? "center",
              ...(duplicate
                ? undefined
                : { animationDelay: `${(i % 10) * 0.05}s` }),
            }}
          />
        ))}
      </div>
    </div>
  );
}
