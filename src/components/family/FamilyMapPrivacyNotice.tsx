"use client";

import { Shield } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

type FamilyMapPrivacyNoticeProps = {
  variant?: "settings" | "family" | "compact";
  className?: string;
};

export function FamilyMapPrivacyNotice({
  variant = "family",
  className,
}: FamilyMapPrivacyNoticeProps) {
  const t = useTranslations();

  const bullets =
    variant === "compact"
      ? [
          t("locationPrivacy.optional"),
          t("locationPrivacy.snapshot"),
          t("locationPrivacy.whoSees"),
        ]
      : [
          t("locationPrivacy.optional"),
          t("locationPrivacy.snapshot"),
          t("locationPrivacy.cityLevel"),
          t("locationPrivacy.preciseLevel"),
          t("locationPrivacy.invitedWarning"),
          t("locationPrivacy.whoSees"),
          t("locationPrivacy.notTracking"),
        ];

  return (
    <aside
      className={cn(
        "rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--canvas-deep)]/35 px-4 py-3",
        className,
      )}
      aria-label={t("locationPrivacy.title")}
    >
      <div className="flex items-start gap-2">
        <Shield
          className="mt-0.5 size-4 shrink-0 text-[color:var(--accent-deep)]"
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{t("locationPrivacy.title")}</p>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed text-ink-muted">
            {bullets.map((line) => (
              <li key={line} className="flex gap-2">
                <span className="text-accent-deep" aria-hidden>
                  •
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}
