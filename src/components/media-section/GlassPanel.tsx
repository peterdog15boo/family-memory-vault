import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type GlassPanelProps = {
  children: ReactNode;
  className?: string;
  /** Slightly stronger frost for denser copy */
  strength?: "soft" | "strong";
};

/**
 * Frosted content panel for media-backed sections — keeps copy readable.
 */
export function GlassPanel({
  children,
  className,
  strength = "soft",
}: GlassPanelProps) {
  return (
    <div
      className={cn(
        "media-glass-panel",
        strength === "strong" && "media-glass-panel--strong",
        className,
      )}
    >
      {children}
    </div>
  );
}
