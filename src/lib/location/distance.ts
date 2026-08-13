import type { FamilyMemberLocation, UserLocationRecord } from "@/lib/location/types";
import { roundCoordinate } from "@/lib/location/privacy";

const EARTH_RADIUS_MILES = 3958.8;
const NEARBY_CITY_LEVEL_MILES = 15;

export type FamilyMemberDistance =
  | { type: "same_city" }
  | { type: "nearby" }
  | { type: "miles"; miles: number };

export type ViewerDistancePoint = {
  latitude: number;
  longitude: number;
  level: "city" | "precise";
  city: string | null;
  region: string | null;
};

export function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function roundDisplayMiles(miles: number): number {
  if (miles < 10) return Math.round(miles * 10) / 10;
  return Math.round(miles);
}

function normalizeCity(city: string | null | undefined): string | null {
  const trimmed = city?.trim().toLowerCase();
  return trimmed || null;
}

/** Point used for distance math — matches map serialization (rounded for city). */
export function getViewerDistancePoint(
  record: UserLocationRecord,
): ViewerDistancePoint | null {
  if (record.locationSharing === "off") return null;
  if (record.latitude == null || record.longitude == null) return null;

  if (record.locationSharing === "city") {
    return {
      latitude: roundCoordinate(record.latitude),
      longitude: roundCoordinate(record.longitude),
      level: "city",
      city: record.locationCity,
      region: record.locationRegion,
    };
  }

  return {
    latitude: record.latitude,
    longitude: record.longitude,
    level: "precise",
    city: record.locationCity,
    region: record.locationRegion,
  };
}

export function computeMemberDistance(
  viewer: ViewerDistancePoint,
  member: FamilyMemberLocation,
): FamilyMemberDistance | null {
  if (member.isSelf) return null;
  if (member.latitude == null || member.longitude == null) return null;

  const rawMiles = haversineMiles(
    viewer.latitude,
    viewer.longitude,
    member.latitude,
    member.longitude,
  );

  if (viewer.level === "city" && member.level === "city") {
    const viewerCity = normalizeCity(viewer.city);
    const memberCity = normalizeCity(member.city);
    if (viewerCity && memberCity && viewerCity === memberCity) {
      return { type: "same_city" };
    }
    if (rawMiles < NEARBY_CITY_LEVEL_MILES) {
      return { type: "nearby" };
    }
  }

  return { type: "miles", miles: roundDisplayMiles(rawMiles) };
}

function distanceSortKey(distance: FamilyMemberDistance | null | undefined): number {
  if (!distance) return Number.POSITIVE_INFINITY;
  if (distance.type === "same_city") return 0;
  if (distance.type === "nearby") return 1;
  return 2 + distance.miles;
}

export function annotateLocationsWithDistance(
  locations: FamilyMemberLocation[],
  viewerRecord: UserLocationRecord,
): {
  locations: FamilyMemberLocation[];
  viewerDistanceEnabled: boolean;
} {
  const viewerPoint = getViewerDistancePoint(viewerRecord);
  if (!viewerPoint) {
    return { locations, viewerDistanceEnabled: false };
  }

  const annotated = locations.map((loc) => ({
    ...loc,
    distance: computeMemberDistance(viewerPoint, loc),
  }));

  annotated.sort((a, b) => {
    if (a.isSelf && !b.isSelf) return -1;
    if (b.isSelf && !a.isSelf) return 1;
    return distanceSortKey(a.distance) - distanceSortKey(b.distance);
  });

  return { locations: annotated, viewerDistanceEnabled: true };
}
