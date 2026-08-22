"use client";

import { ImagePlus } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";

type PhotoRequestBannerProps = {
  request: {
    message: string;
    familyName: string;
    requesterName: string | null;
    status: string;
  };
};

/**
 * Shows the contribution request context on /upload?request=…
 * Does not reveal any private library media.
 */
export function PhotoRequestBanner({ request }: PhotoRequestBannerProps) {
  const t = useTranslations();
  const done = request.status !== "pending";

  return (
    <div className="rounded-xl border border-accent/25 bg-accent/10 px-4 py-3.5">
      <div className="flex gap-3">
        <ImagePlus className="mt-0.5 size-5 shrink-0 text-accent-deep" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {done
              ? t("uploadPage.requestCompleteTitle")
              : t("uploadPage.requestTitle", { family: request.familyName })}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            {request.requesterName
              ? t("uploadPage.requestFrom", {
                  name: request.requesterName,
                  message: request.message,
                })
              : request.message}
          </p>
          {!done ? (
            <p className="mt-2 text-xs text-ink-muted">
              {t("uploadPage.requestHint")}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
