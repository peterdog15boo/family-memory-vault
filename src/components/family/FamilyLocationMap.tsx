"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, Settings2 } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { FamilyLocationMemberList } from "@/components/family/FamilyLocationMemberList";
import { FamilyMapPrivacyNotice } from "@/components/family/FamilyMapPrivacyNotice";
import { FAMILY_LOCATION_UPDATED_EVENT } from "@/lib/location/events";
import { formatFamilyMemberDistance } from "@/lib/location/format-distance";
import type {
  FamilyMemberLocation,
  FamilyLocationsPayload,
} from "@/lib/location/types";
import { locationsWithCoordinates } from "@/lib/maps/family-map";
import { isFamilyMapConfigured } from "@/lib/maps/tiles";
import { cn } from "@/lib/utils";

const FamilyLocationMapInteractive = dynamic(
  () =>
    import("@/components/family/FamilyLocationMapInteractive").then((mod) => ({
      default: mod.FamilyLocationMapInteractive,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="family-map-skeleton flex h-[min(52vh,22rem)] min-h-[16rem] items-center justify-center rounded-[var(--radius-xl)] border border-[color:var(--border-subtle)] bg-[color:var(--canvas-deep)]/40">
        <Loader2 className="size-6 animate-spin text-ink-muted" aria-hidden />
      </div>
    ),
  },
);

type FamilyLocationMapProps = {
  familyId: string;
  viewerUserId: string;
  initialLocations?: FamilyMemberLocation[] | FamilyLocationsPayload | null;
  initialViewerDistanceEnabled?: boolean;
  className?: string;
};

function normalizeLocations(
  value: FamilyLocationMapProps["initialLocations"],
): FamilyMemberLocation[] {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.locations)) return value.locations;
  return [];
}

function FamilyMapUnavailablePanel({
  title,
  hint,
  className,
}: {
  title: string;
  hint: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-[min(52vh,22rem)] min-h-[16rem] flex-col items-center justify-center rounded-[var(--radius-xl)] border border-[color:var(--border-subtle)] bg-[color:var(--canvas-deep)]/35 px-5 py-8 text-center",
        className,
      )}
    >
      <MapPin className="size-8 text-ink-muted" aria-hidden />
      <p className="mt-3 text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-md text-sm text-ink-muted">{hint}</p>
    </div>
  );
}

export function FamilyLocationMap({
  familyId,
  viewerUserId,
  initialLocations = [],
  initialViewerDistanceEnabled = false,
  className,
}: FamilyLocationMapProps) {
  const t = useTranslations();
  const [locations, setLocations] = useState<FamilyMemberLocation[]>(
    normalizeLocations(initialLocations),
  );
  const [viewerDistanceEnabled, setViewerDistanceEnabled] = useState(
    initialViewerDistanceEnabled,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusUserId, setFocusUserId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/family/${familyId}/locations`, {
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        locations?: FamilyMemberLocation[];
        viewerDistanceEnabled?: boolean;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || t("family.locationMapError"));
      }
      setLocations(Array.isArray(data.locations) ? data.locations : []);
      setViewerDistanceEnabled(Boolean(data.viewerDistanceEnabled));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("family.locationMapError"),
      );
    } finally {
      setLoading(false);
    }
  }, [familyId, t]);

  useEffect(() => {
    setLocations(normalizeLocations(initialLocations));
    setViewerDistanceEnabled(initialViewerDistanceEnabled);
  }, [initialLocations, initialViewerDistanceEnabled, familyId]);

  useEffect(() => {
    function onLocationUpdated() {
      void reload();
    }
    function onVisible() {
      if (document.visibilityState === "visible") {
        void reload();
      }
    }

    window.addEventListener(FAMILY_LOCATION_UPDATED_EVENT, onLocationUpdated);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(
        FAMILY_LOCATION_UPDATED_EVENT,
        onLocationUpdated,
      );
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reload]);

  const distanceFor = useCallback(
    (loc: FamilyMemberLocation) => {
      if (!viewerDistanceEnabled || loc.isSelf) return null;
      return formatFamilyMemberDistance(t, loc.distance);
    },
    [viewerDistanceEnabled, t],
  );

  const mapLabels = useMemo(
    () => ({
      unknownMember: t("family.locationUnknownMember"),
      cityBadge: t("family.locationLevelCityBadge"),
      preciseBadge: t("family.locationLevelPreciseBadge"),
      you: t("family.locationYou"),
      mapAriaLabel: t("family.locationMapAria"),
      mapUnavailableTitle: t("family.locationMapUnavailable"),
      mapUnavailableHint: t("family.locationMapUnavailableHint"),
      distanceFor,
    }),
    [t, distanceFor],
  );

  const mappable = useMemo(
    () => locationsWithCoordinates(locations),
    [locations],
  );
  const mapConfigured = isFamilyMapConfigured();

  if (error && locations.length === 0) {
    return (
      <p role="alert" className={cn("text-sm text-red-800", className)}>
        {error}
      </p>
    );
  }

  if (locations.length === 0) {
    return (
      <section
        className={cn(
          "rounded-[var(--radius-xl)] border border-[color:var(--border-subtle)] bg-[color:var(--canvas-deep)]/35 px-5 py-8 text-center",
          className,
        )}
        aria-labelledby="family-map-empty-title"
      >
        <MapPin className="mx-auto size-8 text-ink-muted" aria-hidden />
        <h3
          id="family-map-empty-title"
          className="mt-3 font-display text-lg tracking-tight text-ink"
        >
          {t("family.locationMapTitle")}
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
          {t("family.locationMapEmptyBody")}
        </p>
        <Link
          href="/settings#family-location"
          className="ui-btn ui-btn-secondary mt-5 inline-flex items-center gap-2"
        >
          <Settings2 className="size-4" aria-hidden />
          {t("family.locationMapSettingsCta")}
        </Link>
        <FamilyMapPrivacyNotice variant="family" className="mx-auto mt-6 max-w-lg text-left" />
      </section>
    );
  }

  return (
    <section className={cn("space-y-4", className)} aria-labelledby="family-map-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3
            id="family-map-title"
            className="font-display text-lg tracking-tight text-ink"
          >
            {t("family.locationMapTitle")}
          </h3>
          <p className="mt-1 text-sm text-ink-muted">{t("family.locationMapLead")}</p>
        </div>
        {loading ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {t("family.locationMapRefreshing")}
          </span>
        ) : null}
      </div>

      {!viewerDistanceEnabled ? (
        <p className="rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-canvas/60 px-4 py-3 text-sm text-ink-muted">
          {t("family.distanceShareHint")}{" "}
          <Link
            href="/settings#family-location"
            className="font-medium text-accent-deep underline-offset-2 hover:underline"
          >
            {t("family.locationMapSettingsCta")}
          </Link>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {mappable.length > 0 ? (
        mapConfigured ? (
          <div className="family-map-shell overflow-hidden rounded-[var(--radius-xl)] border border-[color:var(--border-subtle)] shadow-sm">
            <FamilyLocationMapInteractive
              locations={locations}
              labels={mapLabels}
              focusUserId={focusUserId}
              onMarkerOpen={setFocusUserId}
              className="family-map-canvas h-[min(52vh,22rem)] min-h-[16rem] w-full touch-pan-y"
            />
          </div>
        ) : (
          <FamilyMapUnavailablePanel
            title={t("family.locationMapUnavailable")}
            hint={t("family.locationMapUnavailableHint")}
          />
        )
      ) : (
        <p className="rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-canvas/60 px-4 py-3 text-sm text-ink-muted">
          {t("family.locationMapNoCoords")}
        </p>
      )}

      <FamilyLocationMemberList
        locations={locations}
        viewerUserId={viewerUserId}
        viewerDistanceEnabled={viewerDistanceEnabled}
        focusUserId={focusUserId}
        onSelect={mapConfigured && mappable.length > 0 ? setFocusUserId : undefined}
      />

      <FamilyMapPrivacyNotice variant="family" />
    </section>
  );
}
