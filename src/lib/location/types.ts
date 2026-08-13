import type { LocationSharingLevel } from "@/lib/db/schema";
import type { FamilyMemberDistance } from "@/lib/location/distance";

export type UserLocationRecord = {
  locationSharing: LocationSharingLevel;
  locationLabel: string | null;
  locationCity: string | null;
  locationRegion: string | null;
  locationCountry: string | null;
  latitude: number | null;
  longitude: number | null;
  locationUpdatedAt: Date | null;
};

export type OwnLocationSettings = {
  locationSharing: LocationSharingLevel;
  locationLabel: string | null;
  locationCity: string | null;
  locationRegion: string | null;
  locationCountry: string | null;
  latitude: number | null;
  longitude: number | null;
  locationUpdatedAt: string | null;
};

/** What family members see on the map for one person. */
export type FamilyMemberLocation = {
  userId: string;
  displayName: string | null;
  imageUrl: string | null;
  level: "city" | "precise";
  label: string;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  updatedAt: string | null;
  isSelf: boolean;
  /** Set when the viewer has location sharing on — approximate distance from viewer. */
  distance?: FamilyMemberDistance | null;
};

export type { FamilyMemberDistance } from "@/lib/location/distance";

export type FamilyLocationsPayload = {
  locations: FamilyMemberLocation[];
  viewerDistanceEnabled: boolean;
};

export type GeocodedPlace = {
  label: string;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
};
