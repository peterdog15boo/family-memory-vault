/**
 * Reverse geocode via OpenStreetMap Nominatim.
 * Only called after explicit user action — never from IP.
 */

import type { GeocodedPlace } from "@/lib/location/types";
import { buildLocationLabel, roundCoordinate } from "@/lib/location/privacy";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";

type NominatimAddress = {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  region?: string;
  country?: string;
  country_code?: string;
};

function pickCity(address: NominatimAddress): string | null {
  return (
    address.city?.trim() ||
    address.town?.trim() ||
    address.village?.trim() ||
    address.municipality?.trim() ||
    null
  );
}

function pickRegion(address: NominatimAddress): string | null {
  return address.state?.trim() || address.region?.trim() || address.county?.trim() || null;
}

export async function reverseGeocodeApproximate(input: {
  latitude: number;
  longitude: number;
}): Promise<GeocodedPlace> {
  const lat = roundCoordinate(input.latitude);
  const lon = roundCoordinate(input.longitude);

  const params = new URLSearchParams({
    format: "json",
    lat: String(lat),
    lon: String(lon),
    zoom: "10",
    addressdetails: "1",
  });

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://familymemoryvault.ai";

  const response = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": `FamilyMemoryVault/1.0 (${appUrl})`,
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error("Could not look up your approximate area.");
  }

  const data = (await response.json()) as {
    address?: NominatimAddress;
    lat?: string;
    lon?: string;
  };

  const address = data.address ?? {};
  const city = pickCity(address);
  const region = pickRegion(address);
  const country = address.country?.trim() || null;
  const label =
    buildLocationLabel({ city, region, country }) ||
    city ||
    region ||
    country ||
    "Your area";

  return {
    label,
    city,
    region,
    country,
    latitude: lat,
    longitude: lon,
  };
}

export async function geocodeCityQuery(query: string): Promise<GeocodedPlace | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const params = new URLSearchParams({
    format: "json",
    q: trimmed,
    limit: "1",
    addressdetails: "1",
  });

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://familymemoryvault.ai";

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": `FamilyMemoryVault/1.0 (${appUrl})`,
      },
      next: { revalidate: 0 },
    },
  );

  if (!response.ok) return null;

  const rows = (await response.json()) as Array<{
    lat?: string;
    lon?: string;
    address?: NominatimAddress;
    display_name?: string;
  }>;

  const hit = rows[0];
  if (!hit?.lat || !hit.lon) return null;

  const address = hit.address ?? {};
  const city = pickCity(address);
  const region = pickRegion(address);
  const country = address.country?.trim() || null;
  const label =
    buildLocationLabel({ city, region, country }) ||
    hit.display_name?.split(",").slice(0, 2).join(",").trim() ||
    trimmed;

  return {
    label,
    city,
    region,
    country,
    latitude: roundCoordinate(Number(hit.lat)),
    longitude: roundCoordinate(Number(hit.lon)),
  };
}
