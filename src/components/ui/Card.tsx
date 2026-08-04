/**
 * Soft premium card surface — theme-aware.
 */

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type UiCardProps = HTMLAttributes<HTMLDivElement> & {
  /** Slightly stronger elevation (Modern soft depth). */
  elevated?: boolean;
  padding?: "none" | "md" | "lg";
};

export function UiCard({
  className,
  elevated = false,
  padding = "md",
  ...props
}: UiCardProps) {
  return (
    <div
      className={cn(
        "ui-card",
        elevated && "ui-card-elevated",
        padding === "md" && "ui-card-pad",
        padding === "lg" && "ui-card-pad-lg",
        className,
      )}
      {...props}
    />
  );
}
