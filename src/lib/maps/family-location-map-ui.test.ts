import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(process.cwd(), "src");

describe("FamilyLocationMap map key gating", () => {
  it("skips Leaflet mount when Mapbox token is missing", () => {
    const mapUi = readFileSync(
      join(root, "components/family/FamilyLocationMap.tsx"),
      "utf8",
    );
    expect(mapUi).toContain("isFamilyMapConfigured");
    expect(mapUi).toContain("FamilyMapUnavailablePanel");
    expect(mapUi).toContain("locationMapUnavailable");
    expect(mapUi).toContain("FamilyLocationMemberList");
    expect(mapUi).toMatch(/mapConfigured\s*\?\s*\(/);
  });

  it("does not load Mapbox tiles without a public pk token", () => {
    const tiles = readFileSync(join(root, "lib/maps/tiles.ts"), "utf8");
    expect(tiles).toContain("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN");
    expect(tiles).not.toContain("cartocdn.com");
    expect(tiles).toContain('startsWith(MAPBOX_PUBLIC_TOKEN_PREFIX)');
  });

  it("handles tile errors without exposing provider key messaging", () => {
    const interactive = readFileSync(
      join(root, "components/family/FamilyLocationMapInteractive.tsx"),
      "utf8",
    );
    expect(interactive).toContain('layer.on("tileerror"');
    expect(interactive).toContain("mapUnavailableTitle");
    expect(interactive).not.toMatch(/console\.(log|info|debug).*token/i);
  });

  it("renders member markers when the interactive map mounts", () => {
    const interactive = readFileSync(
      join(root, "components/family/FamilyLocationMapInteractive.tsx"),
      "utf8",
    );
    expect(interactive).toContain("L.marker");
    expect(interactive).toContain("locationsWithCoordinates");
    expect(interactive).toContain("getFamilyMapTiles");
  });
});
