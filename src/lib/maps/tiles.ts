import type { TileLayerOptions } from "leaflet";

export type MapTileConfig = {
  url: string;
  options: TileLayerOptions;
};

const MAPBOX_PUBLIC_TOKEN_PREFIX = "pk.";

/**
 * Family Map tiles — Mapbox via `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`.
 * When unset, the map UI stays in a calm empty state (no tile SDK load).
 */
export function getMapboxAccessToken(): string | null {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();
  if (!token || !token.startsWith(MAPBOX_PUBLIC_TOKEN_PREFIX)) {
    return null;
  }
  return token;
}

export function isFamilyMapConfigured(): boolean {
  return getMapboxAccessToken() !== null;
}

export function getFamilyMapTiles(): MapTileConfig {
  const token = getMapboxAccessToken();
  if (!token) {
    throw new Error(
      "Family map tiles require NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN",
    );
  }

  return {
    url: `https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/{z}/{x}/{y}?access_token=${token}`,
    options: {
      tileSize: 512,
      zoomOffset: -1,
      maxZoom: 20,
      attribution:
        '© <a href="https://www.mapbox.com/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  };
}
