/** Dispatched when the signed-in user updates location sharing settings. */
export const FAMILY_LOCATION_UPDATED_EVENT = "fmv:family-location-updated";

export function notifyFamilyLocationUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FAMILY_LOCATION_UPDATED_EVENT));
}
