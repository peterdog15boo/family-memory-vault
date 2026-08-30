import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getFamilyMapTiles,
  getMapboxAccessToken,
  isFamilyMapConfigured,
} from "@/lib/maps/tiles";

describe("family map tiles", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("treats missing token as not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "");
    expect(getMapboxAccessToken()).toBeNull();
    expect(isFamilyMapConfigured()).toBe(false);
    expect(() => getFamilyMapTiles()).toThrow(/NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN/);
  });

  it("treats non-pk tokens as not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "sk.secret");
    expect(getMapboxAccessToken()).toBeNull();
    expect(isFamilyMapConfigured()).toBe(false);
  });

  it("builds Mapbox tile config when a public token is present", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "pk.test-token");
    expect(isFamilyMapConfigured()).toBe(true);
    const tiles = getFamilyMapTiles();
    expect(tiles.url).toContain("api.mapbox.com");
    expect(tiles.url).toContain("access_token=pk.test-token");
    expect(tiles.url).not.toContain("sk.");
  });
});
