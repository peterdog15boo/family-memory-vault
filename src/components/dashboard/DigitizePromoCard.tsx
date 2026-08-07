import Link from "next/link";
import { ArrowRight, Package } from "lucide-react";

/**
 * Soft dashboard promo for Family Memory Box — secondary to core upload/memories CTAs.
 */
export function DigitizePromoCard() {
  return (
    <aside
      className="digitize-promo"
      aria-label="Family Memory Box digitizing"
    >
      <Package className="digitize-promo-icon" aria-hidden />
      <div className="digitize-promo-copy">
        <p className="digitize-promo-title">
          Have boxes of old photos or tapes?
        </p>
        <p className="digitize-promo-body">
          We’ll digitize them for you — then they appear automatically in
          Photos.
        </p>
      </div>
      <Link href="/family-memory-box" className="digitize-promo-link">
        Digitize
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </aside>
  );
}
