import { cn } from "@/lib/utils";

type SquirrelMascotProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
  decorative?: boolean;
  title?: string;
};

const SIZE = {
  sm: "size-10",
  md: "size-16",
  lg: "size-[5.5rem]",
} as const;

/**
 * Warm squirrel mascot for journey celebrations (theme-aware via CSS vars).
 */
export function SquirrelMascot({
  className,
  size = "md",
  decorative = true,
  title = "Vault squirrel",
}: SquirrelMascotProps) {
  return (
    <span
      className={cn(
        "squirrel-mascot relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        SIZE[size],
        className,
      )}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : title}
    >
      <svg
        viewBox="0 0 96 96"
        className="h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        focusable="false"
      >
        <circle cx="48" cy="48" r="48" fill="var(--accent-soft)" />
        {/* Tail */}
        <path
          d="M62 58c14 2 22-10 18-22-6 8-12 8-16 4 8-10 4-22-6-26 10 8 8 20-2 24 4 8 2 16-6 20z"
          fill="color-mix(in srgb, var(--accent-deep) 55%, #8b5a3c)"
        />
        {/* Body */}
        <ellipse
          cx="44"
          cy="58"
          rx="18"
          ry="20"
          fill="color-mix(in srgb, #c48a5a 70%, var(--accent))"
        />
        {/* Belly */}
        <ellipse cx="46" cy="62" rx="10" ry="12" fill="#f3e0c8" />
        {/* Head */}
        <circle
          cx="42"
          cy="38"
          r="16"
          fill="color-mix(in srgb, #c48a5a 70%, var(--accent))"
        />
        {/* Ear */}
        <path
          d="M32 28c-2-10 8-14 12-8-6 2-8 6-8 10z"
          fill="color-mix(in srgb, #c48a5a 70%, var(--accent))"
        />
        <path d="M34 27c0-6 6-8 8-4-4 1-5 3-5 6z" fill="#f3e0c8" />
        {/* Eye + nose */}
        <circle cx="46" cy="38" r="2.2" fill="var(--ink)" />
        <circle cx="46.8" cy="37.2" r="0.7" fill="#fff" />
        <ellipse cx="52" cy="42" rx="2.2" ry="1.5" fill="#6b3f2a" />
        {/* Acorn */}
        <ellipse cx="64" cy="68" rx="7" ry="8" fill="#c9a66a" />
        <path d="M57 64h14c-1 4-5 5-7 5s-6-1-7-5z" fill="#8b5a3c" />
        <path
          d="M64 59v-4"
          stroke="#6b3f2a"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}
