"use client";

import Image from "next/image";
import { MapPin } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import type { FamilyMemberLocation } from "@/lib/location/types";
import { formatFamilyMemberDistance } from "@/lib/location/format-distance";
import { getMapMemberName } from "@/lib/maps/family-map";
import { cn } from "@/lib/utils";

type FamilyLocationMemberListProps = {
  locations: FamilyMemberLocation[];
  viewerUserId: string;
  viewerDistanceEnabled?: boolean;
  focusUserId?: string | null;
  onSelect?: (userId: string) => void;
  className?: string;
};

export function FamilyLocationMemberList({
  locations,
  viewerUserId,
  viewerDistanceEnabled = false,
  focusUserId,
  onSelect,
  className,
}: FamilyLocationMemberListProps) {
  const t = useTranslations();

  if (locations.length === 0) return null;

  return (
    <section
      className={cn("space-y-2", className)}
      aria-label={t("family.locationListAria")}
    >
      <h4 className="text-sm font-medium text-ink">
        {t("family.locationListTitle")}
      </h4>
      <ul className="space-y-2">
        {locations.map((loc) => {
          const name = getMapMemberName(loc, t("family.locationUnknownMember"));
          const isSelf = loc.userId === viewerUserId;
          const hasCoords = loc.latitude != null && loc.longitude != null;
          const isFocused = focusUserId === loc.userId;
          const distanceLabel =
            viewerDistanceEnabled && !isSelf
              ? formatFamilyMemberDistance(t, loc.distance)
              : null;

          return (
            <li key={loc.userId}>
              <button
                type="button"
                onClick={() => onSelect?.(loc.userId)}
                disabled={!hasCoords || !onSelect}
                aria-current={isFocused ? "true" : undefined}
                className={cn(
                  "flex w-full items-start gap-3 rounded-[var(--radius-lg)] border px-4 py-3 text-left transition",
                  isFocused
                    ? "border-accent/40 bg-accent/5"
                    : "border-[color:var(--border-subtle)] bg-canvas/70 hover:border-accent/25",
                  !hasCoords && "cursor-default opacity-90",
                )}
              >
                {loc.imageUrl?.trim() ? (
                  <Image
                    src={loc.imageUrl.trim()}
                    alt=""
                    width={40}
                    height={40}
                    className="mt-0.5 size-10 shrink-0 rounded-full object-cover"
                    unoptimized
                  />
                ) : (
                  <span
                    className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-medium text-accent-deep"
                    aria-hidden
                  >
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">
                    {name}
                    {isSelf ? ` (${t("family.locationYou")})` : ""}
                  </span>
                  <span className="block text-sm text-ink-muted">{loc.label}</span>
                  {distanceLabel ? (
                    <span className="mt-0.5 block text-xs font-medium text-accent-deep">
                      {distanceLabel}
                    </span>
                  ) : null}
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    {loc.level === "city"
                      ? t("family.locationLevelCityBadge")
                      : t("family.locationLevelPreciseBadge")}
                    {loc.updatedAt
                      ? ` · ${t("family.locationUpdated", {
                          date: new Date(loc.updatedAt).toLocaleDateString(),
                        })}`
                      : ""}
                    {!hasCoords ? ` · ${t("family.locationListNoCoords")}` : ""}
                  </span>
                </span>
                <MapPin
                  className={cn(
                    "mt-1 size-4 shrink-0",
                    hasCoords ? "text-accent-deep" : "text-ink-muted/50",
                  )}
                  aria-hidden
                />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
