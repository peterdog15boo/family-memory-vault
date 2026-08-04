import { cn } from "@/lib/utils";

type UiSkeletonProps = {
  className?: string;
  /** Soft rounded block vs pill */
  rounded?: "md" | "lg" | "full";
};

/**
 * Polished loading placeholder — Modern gets a soft shimmer; Original stays a calm pulse.
 */
export function UiSkeleton({
  className,
  rounded = "md",
}: UiSkeletonProps) {
  return (
    <div
      className={cn(
        "ui-skeleton",
        rounded === "full" && "rounded-full",
        rounded === "lg" && "rounded-xl",
        rounded === "md" && "rounded-lg",
        className,
      )}
      aria-hidden
    />
  );
}
