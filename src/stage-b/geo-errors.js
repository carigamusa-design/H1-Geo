/**
 * Honest user-facing messages for degraded Stage B conditions.
 * Pure mappings — the UI layer decides where to display them.
 */

export const GEOLOCATION_MESSAGES = Object.freeze({
  1: "Location permission denied. Place the pin manually on the map.",
  2: "Device position unavailable. Place the pin manually on the map.",
  3: "Device position timed out. Place the pin manually on the map.",
  unavailable: "This browser does not offer geolocation. Place the pin manually on the map.",
  insecure: "Geolocation needs a secure (localhost/HTTPS) context. Place the pin manually on the map.",
});

export function describeGeolocationError(error) {
  if (error && typeof error.code === "number" && GEOLOCATION_MESSAGES[error.code]) {
    return GEOLOCATION_MESSAGES[error.code];
  }
  return GEOLOCATION_MESSAGES.unavailable;
}

export const TILE_FAILURE_MESSAGE =
  "Map tiles failed to load (offline or provider unavailable). You can still enter coordinates manually and save pins.";

export const QUARANTINE_MESSAGE =
  "Some saved data was corrupted and has been quarantined instead of silently repaired. Saved pins continue from the last valid state.";
