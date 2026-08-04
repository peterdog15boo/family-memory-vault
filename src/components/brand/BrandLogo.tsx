import { cn } from "@/lib/utils";
import {
  BRAND_LOGO,
  BRAND_LOGO_ASPECT,
  BRAND_LOGO_INTRINSIC,
  BRAND_LOGO_SIZES,
  BRAND_NAME,
  type BrandLogoSize,
  type BrandLogoTone,
} from "@/content/brand";

export type BrandLogoProps = {
  /** `color` for light UI; `onDark` for photographic / dark veils */
  tone?: BrandLogoTone;
  size?: BrandLogoSize;
  /** Override height in px (width still follows aspect) */
  height?: number;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
  /** Decorative when parent already names the brand */
  decorative?: boolean;
};

/**
 * Official FMV lockup — fixed aspect, height-scaled, never stretched.
 */
export function BrandLogo({
  tone = "color",
  size = "md",
  height,
  className,
  imgClassName,
  priority = false,
  decorative = false,
}: BrandLogoProps) {
  const h = height ?? BRAND_LOGO_SIZES[size];
  const w = Math.round(h * BRAND_LOGO_ASPECT);
  const src = tone === "onDark" ? BRAND_LOGO.onDark : BRAND_LOGO.color;

  return (
    <span
      className={cn(
        "brand-logo",
        tone === "onDark" && "brand-logo--on-dark",
        className,
      )}
      style={{ height: h, width: w }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- public brand paths, crisp at CSS sizes */}
      <img
        src={src}
        alt={decorative ? "" : BRAND_NAME}
        width={BRAND_LOGO_INTRINSIC.width}
        height={BRAND_LOGO_INTRINSIC.height}
        decoding={priority ? "sync" : "async"}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        draggable={false}
        className={cn("brand-logo-img", imgClassName)}
        aria-hidden={decorative || undefined}
      />
    </span>
  );
}
