import { describe, expect, it } from "vitest";
import {
  buildLocationLabel,
  previewLocationForOwner,
  roundCoordinate,
  serializeLocationForFamilyViewer,
} from "@/lib/location/privacy";
import type { UserLocationRecord } from "@/lib/location/types";

const baseRecord = (): UserLocationRecord => ({
  locationSharing: "off",
  locationLabel: null,
  locationCity: null,
  locationRegion: null,
  locationCountry: null,
  latitude: null,
  longitude: null,
  locationUpdatedAt: null,
});

describe("location privacy", () => {
  it("defaults to hidden when sharing is off", () => {
    const serialized = serializeLocationForFamilyViewer({
      userId: "u1",
      displayName: "Alex",
      imageUrl: null,
      record: {
        ...baseRecord(),
        locationSharing: "off",
        locationCity: "Austin",
        latitude: 30.27,
        longitude: -97.74,
      },
      viewerUserId: "u2",
    });
    expect(serialized).toBeNull();
  });

  it("exposes city/region only without precise coords", () => {
    const serialized = serializeLocationForFamilyViewer({
      userId: "u1",
      displayName: "Alex",
      imageUrl: null,
      record: {
        ...baseRecord(),
        locationSharing: "city",
        locationCity: "Austin",
        locationRegion: "Texas",
        locationLabel: "Austin, Texas",
        latitude: 30.267153,
        longitude: -97.743057,
        locationUpdatedAt: new Date("2026-01-01T00:00:00Z"),
      },
      viewerUserId: "u2",
    });

    expect(serialized).toMatchObject({
      level: "city",
      label: "Austin, Texas",
      latitude: 30.27,
      longitude: -97.74,
    });
  });

  it("requires coordinates for precise sharing", () => {
    const serialized = serializeLocationForFamilyViewer({
      userId: "u1",
      displayName: "Alex",
      imageUrl: null,
      record: {
        ...baseRecord(),
        locationSharing: "precise",
        locationLabel: "Austin, Texas",
      },
      viewerUserId: "u2",
    });
    expect(serialized).toBeNull();
  });

  it("returns precise coordinates when enabled", () => {
    const serialized = serializeLocationForFamilyViewer({
      userId: "u1",
      displayName: "Alex",
      imageUrl: null,
      record: {
        ...baseRecord(),
        locationSharing: "precise",
        locationLabel: "Austin, Texas",
        latitude: 30.267153,
        longitude: -97.743057,
        locationUpdatedAt: new Date("2026-01-01T00:00:00Z"),
      },
      viewerUserId: "u1",
    });

    expect(serialized?.level).toBe("precise");
    expect(serialized?.latitude).toBe(30.267153);
    expect(serialized?.isSelf).toBe(true);
  });

  it("builds readable labels", () => {
    expect(
      buildLocationLabel({
        city: "Austin",
        region: "Texas",
      }),
    ).toBe("Austin, Texas");
  });

  it("rounds coordinates for city display", () => {
    expect(roundCoordinate(30.267153)).toBe(30.27);
  });

  it("preview reflects sharing level", () => {
    expect(
      previewLocationForOwner({
        ...baseRecord(),
        locationSharing: "city",
        locationCity: "Austin",
        locationRegion: "Texas",
      }),
    ).toMatchObject({
      level: "city",
      label: "Austin, Texas",
      hasPlace: true,
    });
  });
});
