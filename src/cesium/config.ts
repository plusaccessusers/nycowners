export interface CameraDefault {
  /** Latitude in degrees */
  lat: number;
  /** Longitude in degrees */
  lon: number;
  /** Altitude in meters above the ellipsoid */
  alt: number;
  /** Pitch in degrees; -90 looks straight down, 0 looks at the horizon */
  pitchDegrees: number;
}

export const DEFAULT_CAMERA: CameraDefault = {
  lat: 40.7128,
  lon: -74.0060,
  alt: 6000,
  pitchDegrees: -45,
};

// Browser-exposed env vars MUST use the VITE_ prefix or Vite strips them.
// Empty-string fallback for the Ion token is intentional: the app still runs,
// but terrain will be flat. The README explains this tradeoff.
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
export const CESIUM_ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN ?? '';
