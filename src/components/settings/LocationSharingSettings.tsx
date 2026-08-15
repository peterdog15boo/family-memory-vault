"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Loader2, MapPin, Navigation, Shield, Trash2, EyeOff } from "lucide-react";
import { useTranslations } from "@/components/i18n/LocaleProvider";
import { FamilyMapPrivacyNotice } from "@/components/family/FamilyMapPrivacyNotice";
import type { LocationSharingLevel } from "@/lib/db/schema";
import { readDeviceLocation, isGeolocationSupported } from "@/lib/location/browser";
import { notifyFamilyLocationUpdated } from "@/lib/location/events";
import { announce } from "@/lib/a11y/announce";
import { useAnnounceStatus } from "@/hooks/useAnnounceStatus";
import { cn } from "@/lib/utils";

type LocationSettings = {
  locationSharing: LocationSharingLevel;
  locationLabel: string | null;
  locationCity: string | null;
  locationRegion: string | null;
  locationCountry: string | null;
  latitude: number | null;
  longitude: number | null;
  locationUpdatedAt: string | null;
};

type Preview = {
  level: LocationSharingLevel;
  label: string | null;
  hasPlace: boolean;
};

type SaveState = "idle" | "saving" | "saved" | "error";

export function LocationSharingSettings() {
  const t = useTranslations();
  const sharingGroupId = useId();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<LocationSettings | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmPreciseOpen, setConfirmPreciseOpen] = useState(false);
  useAnnounceStatus(error, { priority: "assertive" });

  useEffect(() => {
    if (state !== "saved") return;
    announce(t("a11y.settingsSaved"), { priority: "polite" });
  }, [state, t]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/location");
      const data = (await res.json().catch(() => ({}))) as {
        settings?: LocationSettings;
        preview?: Preview;
        error?: string;
      };
      if (!res.ok || !data.settings) {
        throw new Error(data.error || "Could not load location settings.");
      }
      setSettings(data.settings);
      setPreview(data.preview ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load location settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePatch(patch: Record<string, unknown>) {
    setState("saving");
    setError(null);
    try {
      const res = await fetch("/api/settings/location", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json().catch(() => ({}))) as {
        settings?: LocationSettings;
        preview?: Preview;
        error?: string;
      };
      if (!res.ok || !data.settings) {
        throw new Error(data.error || "Could not save location settings.");
      }
      setSettings(data.settings);
      setPreview(data.preview ?? null);
      setState("saved");
      notifyFamilyLocationUpdated();
      window.setTimeout(() => setState("idle"), 1500);
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Could not save location settings.");
    }
  }

  async function saveApproximateLocation() {
    if (!isGeolocationSupported()) {
      setError(t("settings.locationGeolocationUnsupported"));
      return;
    }

    setState("saving");
    setError(null);
    try {
      const coords = await readDeviceLocation({ highAccuracy: false });
      const res = await fetch("/api/settings/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "approximate",
          latitude: coords.latitude,
          longitude: coords.longitude,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        settings?: LocationSettings;
        preview?: Preview;
        error?: string;
      };
      if (!res.ok || !data.settings) {
        throw new Error(data.error || "Could not save approximate location.");
      }
      setSettings(data.settings);
      setPreview(data.preview ?? null);
      setState("saved");
      notifyFamilyLocationUpdated();
      window.setTimeout(() => setState("idle"), 1500);
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Could not save approximate location.");
    }
  }

  async function savePreciseLocation() {
    if (!isGeolocationSupported()) {
      setError(t("settings.locationGeolocationUnsupported"));
      return;
    }

    setState("saving");
    setError(null);
    try {
      const coords = await readDeviceLocation({ highAccuracy: true });
      const res = await fetch("/api/settings/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "precise",
          confirmPrecise: true,
          latitude: coords.latitude,
          longitude: coords.longitude,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        settings?: LocationSettings;
        preview?: Preview;
        error?: string;
      };
      if (!res.ok || !data.settings) {
        throw new Error(data.error || "Could not save precise location.");
      }
      setSettings(data.settings);
      setPreview(data.preview ?? null);
      setConfirmPreciseOpen(false);
      setState("saved");
      notifyFamilyLocationUpdated();
      window.setTimeout(() => setState("idle"), 1500);
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Could not save precise location.");
    }
  }

  if (loading || !settings) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-muted">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t("settings.locationLoading")}
      </div>
    );
  }

  const sharing = settings.locationSharing;
  const hasSavedData = Boolean(
    settings.locationLabel?.trim() ||
      settings.locationCity?.trim() ||
      settings.locationRegion?.trim() ||
      settings.locationCountry?.trim() ||
      settings.latitude != null ||
      settings.longitude != null,
  );

  return (
    <div className="space-y-5">
      <FamilyMapPrivacyNotice variant="settings" />

      <fieldset>
        <legend className="text-sm font-medium text-ink">
          {t("settings.locationSharingLevel")}
        </legend>
        <div
          id={sharingGroupId}
          className="mt-3 space-y-2"
          role="radiogroup"
          aria-label={t("settings.locationSharingLevel")}
        >
          {(
            [
              ["off", t("settings.locationLevelOff"), t("settings.locationLevelOffHelp")],
              ["city", t("settings.locationLevelCity"), t("settings.locationLevelCityHelp")],
              ["precise", t("settings.locationLevelPrecise"), t("settings.locationLevelPreciseHelp")],
            ] as const
          ).map(([value, label, help]) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer gap-3 rounded-[var(--radius-lg)] border px-4 py-3 transition",
                sharing === value
                  ? "border-accent/40 bg-accent/5"
                  : "border-[color:var(--border-subtle)] bg-[color:var(--canvas-deep)]/35 hover:border-accent/25",
                state === "saving" && "pointer-events-none opacity-70",
              )}
            >
              <input
                type="radio"
                name="locationSharing"
                value={value}
                checked={sharing === value}
                onChange={() => void savePatch({ locationSharing: value })}
                className="mt-1"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{label}</span>
                <span className="mt-0.5 block text-sm text-ink-muted">{help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {sharing !== "off" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-ink">{t("settings.locationCity")}</span>
              <input
                type="text"
                value={settings.locationCity ?? ""}
                onChange={(event) =>
                  setSettings((prev) =>
                    prev ? { ...prev, locationCity: event.target.value } : prev,
                  )
                }
                onBlur={() =>
                  void savePatch({
                    locationCity: settings.locationCity,
                    locationRegion: settings.locationRegion,
                    locationCountry: settings.locationCountry,
                    geocodeManual: true,
                  })
                }
                placeholder={t("settings.locationCityPlaceholder")}
                className="ui-input mt-1 w-full"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-ink">{t("settings.locationRegion")}</span>
              <input
                type="text"
                value={settings.locationRegion ?? ""}
                onChange={(event) =>
                  setSettings((prev) =>
                    prev ? { ...prev, locationRegion: event.target.value } : prev,
                  )
                }
                onBlur={() =>
                  void savePatch({
                    locationCity: settings.locationCity,
                    locationRegion: settings.locationRegion,
                    locationCountry: settings.locationCountry,
                    geocodeManual: true,
                  })
                }
                placeholder={t("settings.locationRegionPlaceholder")}
                className="ui-input mt-1 w-full"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium text-ink">{t("settings.locationCountry")}</span>
              <input
                type="text"
                value={settings.locationCountry ?? ""}
                onChange={(event) =>
                  setSettings((prev) =>
                    prev ? { ...prev, locationCountry: event.target.value } : prev,
                  )
                }
                onBlur={() =>
                  void savePatch({
                    locationCity: settings.locationCity,
                    locationRegion: settings.locationRegion,
                    locationCountry: settings.locationCountry,
                    geocodeManual: true,
                  })
                }
                placeholder={t("settings.locationCountryPlaceholder")}
                className="ui-input mt-1 w-full"
              />
            </label>
          </div>

          <p className="text-xs leading-relaxed text-ink-muted">
            {t("settings.locationManualHint")}
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void saveApproximateLocation()}
              disabled={state === "saving"}
              className="ui-btn ui-btn-secondary inline-flex items-center gap-2"
            >
              {state === "saving" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Navigation className="size-4" aria-hidden />
              )}
              {t("settings.locationUseApproximate")}
            </button>

            {sharing === "precise" ? (
              <button
                type="button"
                onClick={() => setConfirmPreciseOpen(true)}
                disabled={state === "saving"}
                className="ui-btn ui-btn-secondary inline-flex items-center gap-2"
              >
                <MapPin className="size-4" aria-hidden />
                {t("settings.locationUsePrecise")}
              </button>
            ) : null}
          </div>

          <p className="text-xs leading-relaxed text-ink-muted">
            {t("settings.locationPermissionCopy")}
          </p>
        </>
      ) : null}

      {(sharing !== "off" || hasSavedData) ? (
        <div className="flex flex-col gap-3 border-t border-[color:var(--border-subtle)] pt-4 sm:flex-row sm:flex-wrap">
          {sharing !== "off" ? (
            <button
              type="button"
              onClick={() => void savePatch({ locationSharing: "off" })}
              disabled={state === "saving"}
              className="ui-btn ui-btn-secondary inline-flex items-center gap-2"
            >
              <EyeOff className="size-4" aria-hidden />
              <span>
                <span className="block text-left font-medium">
                  {t("settings.locationStopSharing")}
                </span>
                <span className="block text-left text-xs font-normal text-ink-muted">
                  {t("settings.locationStopSharingHelp")}
                </span>
              </span>
            </button>
          ) : null}
          {hasSavedData ? (
            <button
              type="button"
              onClick={() => {
                if (!window.confirm(t("settings.locationClearConfirm"))) return;
                void savePatch({ clearLocation: true });
              }}
              disabled={state === "saving"}
              className="ui-btn ui-btn-secondary inline-flex items-center gap-2 text-red-900"
            >
              <Trash2 className="size-4" aria-hidden />
              <span>
                <span className="block text-left font-medium">
                  {t("settings.locationClearData")}
                </span>
                <span className="block text-left text-xs font-normal text-ink-muted">
                  {t("settings.locationClearDataHelp")}
                </span>
              </span>
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--canvas-deep)]/35 px-4 py-3">
        <div className="flex items-start gap-2">
          <Shield className="mt-0.5 size-4 shrink-0 text-accent-deep" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">
              {t("settings.locationPreviewTitle")}
            </p>
            <p className="mt-1 text-sm text-ink-muted">
            {sharing === "off"
              ? t("settings.locationPreviewOff")
              : preview?.label
                ? t("settings.locationPreviewOn", { label: preview.label })
                : t("settings.locationPreviewIncomplete")}
            </p>
            {sharing === "city" && preview?.label ? (
              <p className="mt-2 text-xs text-ink-muted">
                {t("settings.locationPreviewCityDetail", { label: preview.label })}
              </p>
            ) : null}
            {sharing === "city" && !preview?.hasPlace ? (
              <p className="mt-2 text-xs text-ink-muted">
                {t("settings.locationPreviewCityIncomplete")}
              </p>
            ) : null}
            {sharing === "precise" && preview?.label ? (
              <p className="mt-2 text-xs text-ink-muted">
                {t("settings.locationPreviewPreciseDetail", { label: preview.label })}
              </p>
            ) : null}
            {sharing === "precise" && !preview?.hasPlace ? (
              <p className="mt-2 text-xs text-ink-muted">
                {t("settings.locationPreviewPreciseIncomplete")}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {confirmPreciseOpen ? (
        <div
          className="rounded-[var(--radius-lg)] border border-amber-700/20 bg-amber-50/80 px-4 py-3 dark:bg-amber-950/20"
          role="dialog"
          aria-labelledby="precise-location-title"
        >
          <p id="precise-location-title" className="text-sm font-medium text-ink">
            {t("settings.locationPreciseConfirmTitle")}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {t("settings.locationPreciseConfirmBody")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void savePreciseLocation()}
              disabled={state === "saving"}
              className="ui-btn ui-btn-primary"
            >
              {t("settings.locationPreciseConfirmAction")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmPreciseOpen(false)}
              className="ui-btn ui-btn-secondary"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {state === "saved" ? (
        <p className="text-sm text-ink-muted">{t("settings.saved")}</p>
      ) : null}
    </div>
  );
}
