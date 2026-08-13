"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker as LeafletMarker } from "leaflet";
import { getFamilyMapTiles } from "@/lib/maps/tiles";
import {
  buildFamilyMapPopupHtml,
  computeMapBounds,
  getMapMemberName,
  locationsWithCoordinates,
} from "@/lib/maps/family-map";
import type { FamilyMemberLocation } from "@/lib/location/types";

export type FamilyLocationMapInteractiveProps = {
  locations: FamilyMemberLocation[];
  labels: {
    unknownMember: string;
    cityBadge: string;
    preciseBadge: string;
    you: string;
    mapAriaLabel: string;
    distanceFor: (loc: FamilyMemberLocation) => string | null;
  };
  focusUserId?: string | null;
  onMarkerOpen?: (userId: string) => void;
  className?: string;
};

export function FamilyLocationMapInteractive({
  locations,
  labels,
  focusUserId,
  onMarkerOpen,
  className,
}: FamilyLocationMapInteractiveProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Map<string, LeafletMarker>>(new Map());
  const onMarkerOpenRef = useRef(onMarkerOpen);
  onMarkerOpenRef.current = onMarkerOpen;

  useEffect(() => {
    let disposed = false;
    let map: LeafletMap | null = null;

    async function init() {
      if (!containerRef.current || disposed) return;

      const L = await import("leaflet");

      if (!containerRef.current || disposed) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markersRef.current.clear();
      }

      const mappable = locationsWithCoordinates(locations);
      const bounds = computeMapBounds(locations);
      const defaultCenter: [number, number] = bounds
        ? [
            (bounds[0][0] + bounds[1][0]) / 2,
            (bounds[0][1] + bounds[1][1]) / 2,
          ]
        : [39.8283, -98.5795];

      map = L.map(containerRef.current, {
        center: defaultCenter,
        zoom: bounds ? 4 : 3,
        scrollWheelZoom: true,
        zoomControl: true,
        attributionControl: true,
      });

      const tiles = getFamilyMapTiles();
      L.tileLayer(tiles.url, tiles.options).addTo(map);

      for (const loc of mappable) {
        const name = getMapMemberName(loc, labels.unknownMember);
        const levelLabel =
          loc.level === "city" ? labels.cityBadge : labels.preciseBadge;
        const isCity = loc.level === "city";

        const icon = L.divIcon({
          className: "family-map-marker-wrap",
          html: `<span class="family-map-marker ${isCity ? "family-map-marker--city" : "family-map-marker--precise"}${loc.isSelf ? " family-map-marker--self" : ""}" aria-hidden="true"></span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 28],
          popupAnchor: [0, -30],
        });

        const marker = L.marker([loc.latitude!, loc.longitude!], { icon });
        marker.bindPopup(
          buildFamilyMapPopupHtml({
            loc,
            name,
            levelLabel,
            youSuffix: labels.you,
            distanceDisplay: labels.distanceFor(loc),
          }),
          {
            className: "family-map-popup-shell",
            minWidth: 220,
            maxWidth: 280,
          },
        );
        marker.on("popupopen", () => onMarkerOpenRef.current?.(loc.userId));
        marker.addTo(map);
        markersRef.current.set(loc.userId, marker);
      }

      if (bounds && mappable.length > 1) {
        map.fitBounds(bounds, { padding: [32, 32], maxZoom: 12 });
      } else if (mappable.length === 1) {
        map.setView([mappable[0]!.latitude!, mappable[0]!.longitude!], 10);
      }

      mapRef.current = map;
    }

    void init();

    return () => {
      disposed = true;
      const markers = markersRef.current;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markers.clear();
      markersRef.current = new Map();
    };
  }, [locations, labels]);

  useEffect(() => {
    if (!focusUserId || !mapRef.current) return;
    const marker = markersRef.current.get(focusUserId);
    if (!marker) return;
    const latLng = marker.getLatLng();
    mapRef.current.setView(latLng, Math.max(mapRef.current.getZoom(), 10), {
      animate: true,
    });
    marker.openPopup();
  }, [focusUserId]);

  return (
    <div
      ref={containerRef}
      className={className}
      role="application"
      aria-label={labels.mapAriaLabel}
    />
  );
}
