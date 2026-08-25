"use client";

import { useMemo, type CSSProperties } from "react";
import { buildFirstFamilyMovieCollage } from "@/content/first-family-movie-collage";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** Slightly stronger veil for dialog steps (upload / wait). */
  denserVeil?: boolean;
};

/** Explicit mosaic size — every cell filled (no wide/tall holes). */
const COLLAGE_COLS = 8;
const COLLAGE_ROWS = 7;
const COLLAGE_CELLS = COLLAGE_COLS * COLLAGE_ROWS;

/**
 * Full-bleed mosaic that slowly pans left in a seamless loop.
 * Mount once for the ritual so motion never resets between steps.
 *
 * Coverage strategy: uniform filled grid, oversized past the viewport
 * (cover/crop), dual panels for a seamless horizontal loop.
 */
export function FirstFamilyMovieCollageBackdrop({
  className,
  denserVeil = false,
}: Props) {
  const tiles = useMemo(() => {
    // Force square cells only — spans leave black holes in CSS grid.
    return buildFirstFamilyMovieCollage(COLLAGE_CELLS).map((tile) => ({
      ...tile,
      span: "square" as const,
    }));
  }, []);

  const gridVars = {
    "--ffm-cols": COLLAGE_COLS,
    "--ffm-rows": COLLAGE_ROWS,
  } as CSSProperties;

  return (
    <div
      className={cn("ffm-collage-backdrop pointer-events-none", className)}
      aria-hidden
      style={gridVars}
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
      <div className="ffm-collage-grid">
        {tiles.map((tile, i) => (
          <div
            key={`${duplicate ? "b" : "a"}-${tile.src}-${i}`}
            className={cn(
              "ffm-welcome-tile",
              !duplicate && "ffm-welcome-tile--enter",
              duplicate && "ffm-welcome-tile--static",
            )}
            style={{
              backgroundImage: `url(${tile.src})`,
              backgroundPosition: tile.focus ?? "center",
              ...(duplicate
                ? undefined
                : { animationDelay: `${(i % 10) * 0.04}s` }),
            }}
          />
        ))}
      </div>
    </div>
  );
}
