import type { TileLayerOptions } from "leaflet";

export type MapTileConfig = {
  url: string;
  options: TileLayerOptions;
};

/**
 * Family Map tiles — Mapbox when `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` is set,
 * otherwise Carto light (no API key required).
 */
export function getFamilyMapTiles(): MapTileConfig {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();

  if (token) {
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

  return {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    options: {
      subdomains: "abcd",
      maxZoom: 20,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
    },
  };
}

export function isFamilyMapConfigured(): boolean {
  return true;
}
