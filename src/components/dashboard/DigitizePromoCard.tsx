"use client";

import Link from "next/link";
import { ArrowRight, Package } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";

/**
 * Soft dashboard promo for Family Memory Box — secondary to core upload/memories CTAs.
 */
export function DigitizePromoCard() {
  const t = useTranslations();
  return (
    <aside
      className="digitize-promo"
      aria-label={t("memoryBox.promoAria")}
    >
      <Package className="digitize-promo-icon" aria-hidden />
      <div className="digitize-promo-copy">
        <p className="digitize-promo-title">{t("memoryBox.promoTitle")}</p>
        <p className="digitize-promo-body">{t("memoryBox.promoBody")}</p>
      </div>
      <Link href="/family-memory-box" className="digitize-promo-link">
        {t("memoryBox.promoCta")}
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </aside>
  );
}
