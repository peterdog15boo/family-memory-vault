import { and, eq, isNull } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { familyMembers, users } from "@/lib/db/schema";
import {
  isLocationSharingLevel,
  serializeLocationForFamilyViewer,
} from "@/lib/location/privacy";
import type { FamilyMemberLocation, FamilyLocationsPayload, UserLocationRecord } from "@/lib/location/types";
import { requireActiveFamilyMember } from "@/lib/families";
import { annotateLocationsWithDistance } from "@/lib/location/distance";
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

function toLocationRecord(row: {
  locationSharing: string | null;
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

/**
 * Active family members eligible for the map:
 * - status active (excludes pending / removed / declined)
 * - linked user account (pending invites without userId excluded)
 * - not suspended
 */
async function queryActiveFamilyMemberLocations(familyId: string) {
  const db = getDb();
  return db
    .select({
      userId: users.id,
      displayName: users.displayName,
      imageUrl: users.imageUrl,
      memberStatus: familyMembers.status,
      ...locationSelect,
    })
    .from(familyMembers)
    .innerJoin(users, eq(familyMembers.userId, users.id))
    .where(
      and(
        eq(familyMembers.familyId, familyId),
        eq(familyMembers.status, "active"),
        isNull(users.suspendedAt),
      ),
    )
    .orderBy(users.displayName);
}

async function loadFamilyMemberLocations(
  familyId: string,
  viewerUserId: string,
): Promise<FamilyLocationsPayload> {
  await requireActiveFamilyMember(familyId, viewerUserId);

  const db = getDb();
  const [viewerRow] = await db
    .select(locationSelect)
    .from(users)
    .where(eq(users.id, viewerUserId))
    .limit(1);

  const rows = await queryActiveFamilyMemberLocations(familyId);
  const out: FamilyMemberLocation[] = [];

  for (const row of rows) {
    const serialized = serializeLocationForFamilyViewer({
      userId: row.userId,
      displayName: row.displayName,
      imageUrl: row.imageUrl,
      record: toLocationRecord(row),
      viewerUserId,
    });
    if (serialized) out.push(serialized);
  }

  const viewerRecord = toLocationRecord(
    viewerRow ?? {
      locationSharing: "off",
      locationLabel: null,
      locationCity: null,
      locationRegion: null,
      locationCountry: null,
      latitude: null,
      longitude: null,
      locationUpdatedAt: null,
    },
  );

  return annotateLocationsWithDistance(out, viewerRecord);
}
/** Request-scoped cache — dedupes within a single Family page render. */
export const getFamilyMemberLocations = cache(loadFamilyMemberLocations);
