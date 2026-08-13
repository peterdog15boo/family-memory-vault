import { describe, expect, it } from "vitest";
import {
  buildFamilyMapPopupHtml,
  computeMapBounds,
  escapeMapHtml,
  locationsWithCoordinates,
} from "@/lib/maps/family-map";
import type { FamilyMemberLocation } from "@/lib/location/types";

const sample: FamilyMemberLocation = {
  userId: "u1",
  displayName: "Alex <script>",
  imageUrl: "https://example.com/a.jpg",
  level: "city",
  label: "Austin, TX",
  city: "Austin",
  region: "Texas",
  country: "United States",
  latitude: 30.27,
  longitude: -97.74,
  updatedAt: null,
  isSelf: false,
};

describe("family map helpers", () => {
  it("escapes popup html", () => {
    const html = buildFamilyMapPopupHtml({
      loc: sample,
      name: "Alex <script>",
      levelLabel: "City/region",
      youSuffix: "You",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("Austin, TX");
  });

  it("filters locations with coordinates", () => {
    expect(
      locationsWithCoordinates([
        sample,
        { ...sample, userId: "u2", latitude: null, longitude: null },
      ]),
    ).toHaveLength(1);
  });

  it("computes padded bounds", () => {
    const bounds = computeMapBounds([sample]);
    expect(bounds).not.toBeNull();
    expect(bounds![0][0]).toBeLessThan(30.27);
    expect(bounds![1][0]).toBeGreaterThan(30.27);
  });

  it("escapes entities", () => {
    expect(escapeMapHtml(`a & b <c>`)).toBe("a &amp; b &lt;c&gt;");
  });
});
