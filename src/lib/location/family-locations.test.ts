import { describe, expect, it } from "vitest";
import { serializeLocationForFamilyViewer } from "@/lib/location/privacy";
import type { UserLocationRecord } from "@/lib/location/types";

const base: UserLocationRecord = {
  locationSharing: "city",
  locationLabel: "Austin, TX",
  locationCity: "Austin",
  locationRegion: "Texas",
  locationCountry: "United States",
  latitude: 30.27,
  longitude: -97.74,
  locationUpdatedAt: new Date("2026-01-01T00:00:00Z"),
};

describe("family location membership integration", () => {
  it("only serializes when sharing is enabled with place data", () => {
    expect(
      serializeLocationForFamilyViewer({
        userId: "u1",
        displayName: "Alex",
        imageUrl: null,
        record: { ...base, locationSharing: "off" },
        viewerUserId: "u2",
      }),
    ).toBeNull();

    expect(
      serializeLocationForFamilyViewer({
        userId: "u1",
        displayName: "Alex",
        imageUrl: null,
        record: base,
        viewerUserId: "u2",
      }),
    ).not.toBeNull();
  });

  it("uses profile display name from membership join", () => {
    const row = serializeLocationForFamilyViewer({
      userId: "u1",
      displayName: "Jordan",
      imageUrl: "https://example.com/j.jpg",
      record: base,
      viewerUserId: "u2",
    });
    expect(row?.displayName).toBe("Jordan");
    expect(row?.imageUrl).toBe("https://example.com/j.jpg");
  });
});
