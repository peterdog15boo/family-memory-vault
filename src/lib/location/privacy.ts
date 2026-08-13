import {
  LOCATION_SHARING_LEVELS,
  type LocationSharingLevel,
} from "@/lib/db/schema";
import type { FamilyMemberLocation, UserLocationRecord } from "@/lib/location/types";

/** ~1.1 km at mid-latitudes — coarse enough for city/region display. */
export const CITY_COORD_DECIMALS = 2;

export function isLocationSharingLevel(
  value: unknown,
): value is LocationSharingLevel {
  return (
    typeof value === "string" &&
    (LOCATION_SHARING_LEVELS as readonly string[]).includes(value)
  );
}

export function roundCoordinate(value: number, decimals = CITY_COORD_DECIMALS) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function buildLocationLabel(input: {
  city?: string | null;
  region?: string | null;
  country?: string | null;
}): string | null {
  const city = input.city?.trim();
  const region = input.region?.trim();
  const country = input.country?.trim();
  const parts: string[] = [];
  if (city) parts.push(city);
  if (region && region !== city) parts.push(region);
  if (!city && !region && country) parts.push(country);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function hasPlaceData(record: UserLocationRecord): boolean {
  return Boolean(
    record.locationLabel?.trim() ||
      record.locationCity?.trim() ||
      record.locationRegion?.trim() ||
      record.locationCountry?.trim() ||
      (record.latitude != null && record.longitude != null),
  );
}

/**
 * Serialize a user's location for family viewers.
 * Returns null when sharing is off or there is nothing safe to show.
 */
export function serializeLocationForFamilyViewer(input: {
  userId: string;
  displayName: string | null;
  imageUrl: string | null;
  record: UserLocationRecord;
  viewerUserId: string;
}): FamilyMemberLocation | null {
  const { record, userId, displayName, imageUrl, viewerUserId } = input;

  if (record.locationSharing === "off") return null;
  if (!hasPlaceData(record)) return null;

  const label =
    record.locationLabel?.trim() ||
    buildLocationLabel({
      city: record.locationCity,
      region: record.locationRegion,
      country: record.locationCountry,
    }) ||
    "Unknown area";

  if (record.locationSharing === "city") {
    const lat =
      record.latitude != null ? roundCoordinate(record.latitude) : null;
    const lng =
      record.longitude != null ? roundCoordinate(record.longitude) : null;

    return {
      userId,
      displayName,
      imageUrl,
      level: "city",
      label,
      city: record.locationCity,
      region: record.locationRegion,
      country: record.locationCountry,
      latitude: lat,
      longitude: lng,
      updatedAt: record.locationUpdatedAt?.toISOString() ?? null,
      isSelf: userId === viewerUserId,
    };
  }

  if (record.locationSharing === "precise") {
    if (record.latitude == null || record.longitude == null) return null;

    return {
      userId,
      displayName,
      imageUrl,
      level: "precise",
      label,
      city: record.locationCity,
      region: record.locationRegion,
      country: record.locationCountry,
      latitude: record.latitude,
      longitude: record.longitude,
      updatedAt: record.locationUpdatedAt?.toISOString() ?? null,
      isSelf: userId === viewerUserId,
    };
  }

  return null;
}

/** Preview data for Settings — translate detail copy in the UI. */
export function previewLocationForOwner(record: UserLocationRecord): {
  level: LocationSharingLevel;
  label: string | null;
  hasPlace: boolean;
} {
  const label =
    record.locationLabel?.trim() ||
    buildLocationLabel({
      city: record.locationCity,
      region: record.locationRegion,
      country: record.locationCountry,
    }) ||
    null;

  return {
    level: record.locationSharing,
    label,
    hasPlace: hasPlaceData(record),
  };
}
