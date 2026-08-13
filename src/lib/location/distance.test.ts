import { describe, expect, it } from "vitest";
import {
  annotateLocationsWithDistance,
  computeMemberDistance,
  getViewerDistancePoint,
  haversineMiles,
  roundDisplayMiles,
} from "@/lib/location/distance";
import type { FamilyMemberLocation, UserLocationRecord } from "@/lib/location/types";

const viewerRecord = (): UserLocationRecord => ({
  locationSharing: "city",
  locationLabel: "Austin, Texas",
  locationCity: "Austin",
  locationRegion: "Texas",
  locationCountry: "United States",
  latitude: 30.267153,
  longitude: -97.743057,
  locationUpdatedAt: new Date(),
});

function member(overrides: Partial<FamilyMemberLocation>): FamilyMemberLocation {
  return {
    userId: "u2",
    displayName: "Jordan",
    imageUrl: null,
    level: "city",
    label: "Dallas, Texas",
    city: "Dallas",
    region: "Texas",
    country: "United States",
    latitude: 32.7767,
    longitude: -96.797,
    updatedAt: null,
    isSelf: false,
    ...overrides,
  };
}

describe("location distance", () => {
  it("computes haversine miles between Austin and Dallas", () => {
    const miles = haversineMiles(30.27, -97.74, 32.78, -96.8);
    expect(miles).toBeGreaterThan(180);
    expect(miles).toBeLessThan(210);
  });

  it("rounds display miles under 10 to one decimal", () => {
    expect(roundDisplayMiles(4.26)).toBe(4.3);
    expect(roundDisplayMiles(12.4)).toBe(12);
    expect(roundDisplayMiles(1250.2)).toBe(1250);
  });

  it("uses rounded city point for viewer", () => {
    const point = getViewerDistancePoint(viewerRecord());
    expect(point).toMatchObject({
      latitude: 30.27,
      longitude: -97.74,
      level: "city",
      city: "Austin",
    });
  });

  it("returns same city when both share city-level Austin", () => {
    const viewer = getViewerDistancePoint(viewerRecord())!;
    const dist = computeMemberDistance(
      viewer,
      member({
        city: "Austin",
        label: "Austin, Texas",
        latitude: 30.27,
        longitude: -97.74,
      }),
    );
    expect(dist).toEqual({ type: "same_city" });
  });

  it("annotates members with distance and sorts nearest first", () => {
    const { locations, viewerDistanceEnabled } = annotateLocationsWithDistance(
      [
        member({
          userId: "far",
          latitude: 40.71,
          longitude: -74.01,
          city: "New York",
          label: "New York, NY",
        }),
        member({
          userId: "near",
          latitude: 30.45,
          longitude: -97.7,
          city: "Round Rock",
          label: "Round Rock, TX",
        }),
        member({
          userId: "self",
          isSelf: true,
          city: "Austin",
          label: "Austin, TX",
          latitude: 30.27,
          longitude: -97.74,
        }),
      ],
      viewerRecord(),
    );

    expect(viewerDistanceEnabled).toBe(true);
    expect(locations[0]?.isSelf).toBe(true);
    expect(locations[1]?.userId).toBe("near");
    expect(locations[1]?.distance?.type).toBe("nearby");
    expect(locations[2]?.distance?.type).toBe("miles");
  });

  it("skips distance when viewer sharing is off", () => {
    const result = annotateLocationsWithDistance(
      [member({})],
      { ...viewerRecord(), locationSharing: "off" },
    );
    expect(result.viewerDistanceEnabled).toBe(false);
    expect(result.locations[0]?.distance).toBeUndefined();
  });
});
