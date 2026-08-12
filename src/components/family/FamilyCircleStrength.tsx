"use client";

import { Users } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { FAMILY_CIRCLE_LADDER } from "@/lib/gamification/catalog";
import type { SerializedFamilyMember } from "@/lib/families/serialize";
import { cn } from "@/lib/utils";

type FamilyCircleStrengthProps = {
  members: SerializedFamilyMember[];
  className?: string;
};

export function FamilyCircleStrength({
  members,
  className,
}: FamilyCircleStrengthProps) {
  const t = useTranslations();
  const active = members.filter((m) => m.status === "active");
  const pending = members.filter((m) => m.status === "pending");
  const contributing = active.filter((m) => m.firstContributedAt).length;
  const next =
    FAMILY_CIRCLE_LADDER.find((n) => n > contributing) ?? null;
  const goal = next ?? Math.max(contributing, 1);
  const ratio = next ? Math.min(1, contributing / goal) : 1;
  const ring = 2 * Math.PI * 28;
  const dash = ring * (1 - ratio);

  return (
    <section
      className={cn(
        "family-circle-strength ui-card ui-card-elevated flex items-center gap-4 px-4 py-4 sm:px-5",
        className,
      )}
      aria-label={t("family.circleAria")}
    >
      <span className="relative inline-flex size-16 shrink-0 items-center justify-center">
        <svg viewBox="0 0 64 64" className="size-16 -rotate-90" aria-hidden>
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke="color-mix(in srgb, var(--ink) 10%, transparent)"
            strokeWidth="5"
          />
          <circle
            cx="32"
            cy="32"
            r="28"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={ring}
            strokeDashoffset={dash}
          />
        </svg>
        <Users className="absolute size-5 text-accent-deep" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-deep">
          {t("family.circleTitle")}
        </p>
        <p className="mt-0.5 text-sm font-semibold tracking-tight text-ink">
          {next
            ? t("family.circleProgress", {
                current: contributing,
                next,
              })
            : t("family.circleComplete", { current: contributing })}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
          {t("family.circleLead", {
            active: active.length,
            pending: pending.length,
          })}
        </p>
      </div>
    </section>
  );
}
