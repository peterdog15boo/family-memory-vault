export type DeviceCoordinates = {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
};

export function isGeolocationSupported(): boolean {
  return typeof window !== "undefined" && "geolocation" in navigator;
}

export function readDeviceLocation(options?: {
  highAccuracy?: boolean;
  timeoutMs?: number;
}): Promise<DeviceCoordinates> {
  if (!isGeolocationSupported()) {
    return Promise.reject(new Error("Geolocation is not supported in this browser."));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : null,
        });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error("Location permission was denied."));
        } else if (error.code === error.TIMEOUT) {
          reject(new Error("Location request timed out."));
        } else {
          reject(new Error("Could not read your current location."));
        }
      },
      {
        enableHighAccuracy: options?.highAccuracy ?? false,
        timeout: options?.timeoutMs ?? 20_000,
        maximumAge: 0,
      },
    );
  });
}
