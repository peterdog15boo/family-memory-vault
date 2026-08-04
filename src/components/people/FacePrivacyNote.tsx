import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

type FacePrivacyNoteProps = {
  className?: string;
  /** Compact single-line style for footers. */
  compact?: boolean;
};

/**
 * Short privacy reminder for People / face features.
 */
export function FacePrivacyNote({
  className,
  compact = false,
}: FacePrivacyNoteProps) {
  return (
    <p
      className={cn(
        "flex gap-2 text-ink-muted",
        compact ? "text-xs leading-relaxed" : "text-sm leading-relaxed",
        className,
      )}
    >
      <Shield
        className={cn(
          "shrink-0 text-accent",
          compact ? "mt-0.5 size-3.5" : "mt-0.5 size-4",
        )}
        aria-hidden
      />
      <span>
        Face recognition stays private to your account — it helps you name the
        people in your photos. It only runs on photos that are ready, and never
        shares face data with others.
      </span>
    </p>
  );
}
