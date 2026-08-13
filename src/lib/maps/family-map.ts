import type { FamilyMemberLocation } from "@/lib/location/types";

export function escapeMapHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function getMapMemberName(
  loc: FamilyMemberLocation,
  fallback: string,
): string {
  return loc.displayName?.trim() || fallback;
}

export function buildFamilyMapPopupHtml(input: {
  loc: FamilyMemberLocation;
  name: string;
  levelLabel: string;
  youSuffix: string;
  distanceDisplay?: string | null;
}): string {
  const { loc, name, levelLabel, youSuffix, distanceDisplay } = input;
  const safeName = escapeMapHtml(name);
  const safeLabel = escapeMapHtml(loc.label);
  const safeLevel = escapeMapHtml(levelLabel);
  const safeDistance = distanceDisplay
    ? escapeMapHtml(distanceDisplay)
    : null;
  const self = loc.isSelf ? escapeMapHtml(youSuffix) : "";

  const avatar = loc.imageUrl?.trim()
    ? `<img src="${escapeMapHtml(loc.imageUrl.trim())}" alt="" class="family-map-popup__avatar" width="40" height="40" loading="lazy" decoding="async" />`
    : `<span class="family-map-popup__avatar family-map-popup__avatar--fallback" aria-hidden="true">${safeName.slice(0, 1).toUpperCase()}</span>`;

  return `
    <div class="family-map-popup">
      <div class="family-map-popup__header">
        ${avatar}
        <div class="family-map-popup__meta">
          <p class="family-map-popup__name">${safeName}${self ? ` <span class="family-map-popup__you">${self}</span>` : ""}</p>
          <p class="family-map-popup__label">${safeLabel}</p>
          ${safeDistance ? `<p class="family-map-popup__distance">${safeDistance}</p>` : ""}
        </div>
      </div>
      <p class="family-map-popup__level">${safeLevel}</p>
    </div>
  `;
}

export function locationsWithCoordinates(
  locations: FamilyMemberLocation[],
): FamilyMemberLocation[] {
  if (!Array.isArray(locations)) return [];
  return locations.filter(
    (loc) => loc.latitude != null && loc.longitude != null,
  );
}

export function computeMapBounds(
  locations: FamilyMemberLocation[],
): [[number, number], [number, number]] | null {
  const withCoords = locationsWithCoordinates(locations);
  if (withCoords.length === 0) return null;

  let minLat = withCoords[0]!.latitude!;
  let maxLat = withCoords[0]!.latitude!;
  let minLng = withCoords[0]!.longitude!;
  let maxLng = withCoords[0]!.longitude!;

  for (const loc of withCoords) {
    minLat = Math.min(minLat, loc.latitude!);
    maxLat = Math.max(maxLat, loc.latitude!);
    minLng = Math.min(minLng, loc.longitude!);
    maxLng = Math.max(maxLng, loc.longitude!);
  }

  const padLat = Math.max((maxLat - minLat) * 0.15, 0.08);
  const padLng = Math.max((maxLng - minLng) * 0.15, 0.08);

  return [
    [minLat - padLat, minLng - padLng],
    [maxLat + padLat, maxLng + padLng],
  ];
}
