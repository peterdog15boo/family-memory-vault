import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, type LocationSharingLevel } from "@/lib/db/schema";
import { geocodeCityQuery, reverseGeocodeApproximate } from "@/lib/location/geocode";
import {
  buildLocationLabel,
  isLocationSharingLevel,
  previewLocationForOwner,
  roundCoordinate,
} from "@/lib/location/privacy";
import type {
  FamilyMemberLocation,
  OwnLocationSettings,
  UserLocationRecord,
} from "@/lib/location/types";

export {
  buildLocationLabel,
  isLocationSharingLevel,
  previewLocationForOwner,
  serializeLocationForFamilyViewer,
} from "@/lib/location/privacy";
export type {
  FamilyMemberLocation,
  FamilyLocationsPayload,
  OwnLocationSettings,
  UserLocationRecord,
  GeocodedPlace,
} from "@/lib/location/types";
export type { FamilyMemberDistance } from "@/lib/location/distance";

const locationSelect = {
  locationSharing: users.locationSharing,
  locationLabel: users.locationLabel,
  locationCity: users.locationCity,
  locationRegion: users.locationRegion,
  locationCountry: users.locationCountry,
  latitude: users.latitude,
  longitude: users.longitude,
  locationUpdatedAt: users.locationUpdatedAt,
};

function toRecord(row: {
  locationSharing: LocationSharingLevel | null;
  locationLabel: string | null;
  locationCity: string | null;
  locationRegion: string | null;
  locationCountry: string | null;
  latitude: number | null;
  longitude: number | null;
  locationUpdatedAt: Date | null;
}): UserLocationRecord {
  return {
    locationSharing: isLocationSharingLevel(row.locationSharing)
      ? row.locationSharing
      : "off",
    locationLabel: row.locationLabel,
    locationCity: row.locationCity,
    locationRegion: row.locationRegion,
    locationCountry: row.locationCountry,
    latitude: row.latitude,
    longitude: row.longitude,
    locationUpdatedAt: row.locationUpdatedAt,
  };
}

function serializeOwnSettings(record: UserLocationRecord): OwnLocationSettings {
  return {
    locationSharing: record.locationSharing,
    locationLabel: record.locationLabel,
    locationCity: record.locationCity,
    locationRegion: record.locationRegion,
    locationCountry: record.locationCountry,
    latitude: record.latitude,
    longitude: record.longitude,
    locationUpdatedAt: record.locationUpdatedAt?.toISOString() ?? null,
  };
}

export async function getUserLocationRecord(
  userId: string,
): Promise<UserLocationRecord> {
  const db = getDb();
  const [row] = await db
    .select(locationSelect)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) {
    return {
      locationSharing: "off",
      locationLabel: null,
      locationCity: null,
      locationRegion: null,
      locationCountry: null,
      latitude: null,
      longitude: null,
      locationUpdatedAt: null,
    };
  }

  return toRecord(row);
}

export async function getOwnLocationSettings(userId: string) {
  const record = await getUserLocationRecord(userId);
  return {
    settings: serializeOwnSettings(record),
    preview: previewLocationForOwner(record),
  };
}

export type UpdateLocationInput = {
  locationSharing?: LocationSharingLevel;
  locationLabel?: string | null;
  locationCity?: string | null;
  locationRegion?: string | null;
  locationCountry?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geocodeManual?: boolean;
  clearLocation?: boolean;
};

export async function updateUserLocation(
  userId: string,
  input: UpdateLocationInput,
): Promise<OwnLocationSettings> {
  if (input.clearLocation) {
    return clearUserLocation(userId);
  }

  const current = await getUserLocationRecord(userId);
  const nextSharing = input.locationSharing ?? current.locationSharing;

  let locationLabel =
    input.locationLabel !== undefined
      ? input.locationLabel?.trim() || null
      : current.locationLabel;
  let locationCity =
    input.locationCity !== undefined
      ? input.locationCity?.trim() || null
      : current.locationCity;
  let locationRegion =
    input.locationRegion !== undefined
      ? input.locationRegion?.trim() || null
      : current.locationRegion;
  let locationCountry =
    input.locationCountry !== undefined
      ? input.locationCountry?.trim() || null
      : current.locationCountry;
  let latitude =
    input.latitude !== undefined ? input.latitude : current.latitude;
  let longitude =
    input.longitude !== undefined ? input.longitude : current.longitude;

  if (nextSharing === "off") {
    // Keep stored place data for re-enable, but family map reads sharing level only.
  } else if (nextSharing === "city") {
    if (latitude != null && longitude != null) {
      latitude = roundCoordinate(latitude);
      longitude = roundCoordinate(longitude);
    }
  }

  if (
    input.geocodeManual &&
    nextSharing !== "off" &&
    latitude == null &&
    longitude == null &&
    (locationCity || locationRegion || locationCountry || locationLabel)
  ) {
    const query =
      locationLabel ||
      buildLocationLabel({
        city: locationCity,
        region: locationRegion,
        country: locationCountry,
      });
    if (query) {
      const geocoded = await geocodeCityQuery(query);
      if (geocoded) {
        locationLabel = geocoded.label;
        locationCity = geocoded.city;
        locationRegion = geocoded.region;
        locationCountry = geocoded.country;
        latitude = geocoded.latitude;
        longitude = geocoded.longitude;
      }
    }
  }

  if (!locationLabel) {
    locationLabel = buildLocationLabel({
      city: locationCity,
      region: locationRegion,
      country: locationCountry,
    });
  }

  const now = new Date();
  const db = getDb();
  await db
    .update(users)
    .set({
      locationSharing: nextSharing,
      locationLabel,
      locationCity,
      locationRegion,
      locationCountry,
      latitude,
      longitude,
      locationUpdatedAt:
        nextSharing === "off"
          ? current.locationUpdatedAt
          : now,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  return serializeOwnSettings(
    toRecord({
      locationSharing: nextSharing,
      locationLabel,
      locationCity,
      locationRegion,
      locationCountry,
      latitude,
      longitude,
      locationUpdatedAt: nextSharing === "off" ? current.locationUpdatedAt : now,
    }),
  );
}

export async function applyApproximateLocationFromDevice(input: {
  userId: string;
  latitude: number;
  longitude: number;
}): Promise<OwnLocationSettings> {
  const geocoded = await reverseGeocodeApproximate({
    latitude: input.latitude,
    longitude: input.longitude,
  });

  return updateUserLocation(input.userId, {
    locationSharing: "city",
    locationLabel: geocoded.label,
    locationCity: geocoded.city,
    locationRegion: geocoded.region,
    locationCountry: geocoded.country,
    latitude: geocoded.latitude,
    longitude: geocoded.longitude,
  });
}

export async function applyPreciseLocationFromDevice(input: {
  userId: string;
  latitude: number;
  longitude: number;
  locationLabel?: string | null;
  locationCity?: string | null;
  locationRegion?: string | null;
  locationCountry?: string | null;
}): Promise<OwnLocationSettings> {
  let label = input.locationLabel?.trim() || null;
  let city = input.locationCity?.trim() || null;
  let region = input.locationRegion?.trim() || null;
  let country = input.locationCountry?.trim() || null;

  if (!label && !city && !region && !country) {
    const geocoded = await reverseGeocodeApproximate({
      latitude: input.latitude,
      longitude: input.longitude,
    });
    label = geocoded.label;
    city = geocoded.city;
    region = geocoded.region;
    country = geocoded.country;
  }

  return updateUserLocation(input.userId, {
    locationSharing: "precise",
    locationLabel: label,
    locationCity: city,
    locationRegion: region,
    locationCountry: country,
    latitude: input.latitude,
    longitude: input.longitude,
  });
}

/** Wipe all saved location fields and turn sharing off. */
export async function clearUserLocation(
  userId: string,
): Promise<OwnLocationSettings> {
  const db = getDb();
  const now = new Date();
  await db
    .update(users)
    .set({
      locationSharing: "off",
      locationLabel: null,
      locationCity: null,
      locationRegion: null,
      locationCountry: null,
      latitude: null,
      longitude: null,
      locationUpdatedAt: null,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  return {
    locationSharing: "off",
    locationLabel: null,
    locationCity: null,
    locationRegion: null,
    locationCountry: null,
    latitude: null,
    longitude: null,
    locationUpdatedAt: null,
  };
}

export { getFamilyMemberLocations } from "@/lib/location/family-locations";
export { FAMILY_LOCATION_UPDATED_EVENT, notifyFamilyLocationUpdated } from "@/lib/location/events";
