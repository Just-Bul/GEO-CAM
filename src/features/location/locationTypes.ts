/**
 * A single location reading reported by the operating system.
 * Every field comes directly from the platform; nothing here is estimated by the app.
 */
export interface LocationReading {
  latitude: number;
  longitude: number;
  /** Horizontal accuracy radius in meters, as reported by the OS. */
  accuracy: number | null;
  altitude: number | null;
  altitudeAccuracy: number | null;
  /** Meters per second. */
  speed: number | null;
  /** Direction of travel in degrees from true north (not the compass heading). */
  course: number | null;
  /** Epoch milliseconds at which the OS obtained this fix. */
  timestamp: number;
  /** Android reports whether the reading came from a mock provider. */
  mocked: boolean;
  /**
   * `live` readings come from an active watch/request in this session.
   * `last-known` readings come from the OS cache and may be old.
   */
  source: 'live' | 'last-known';
}

export type LocationPermissionState =
  | 'undetermined'
  | 'granted-precise'
  | 'granted-approximate'
  | 'denied'
  | 'blocked';

export type LocationServiceStatus =
  | 'idle'
  | 'permission-required'
  | 'services-disabled'
  | 'searching'
  | 'active'
  | 'error';

/** How trustworthy the reading attached to a capture is. */
export type LocationFreshness = 'current' | 'cached' | 'unavailable';

export interface LocationSnapshot {
  status: LocationServiceStatus;
  permission: LocationPermissionState;
  /** Most recent reading of any kind. */
  reading: LocationReading | null;
  /** Compass heading in degrees (true north if available, otherwise magnetic), or null. */
  heading: number | null;
  errorCode: string | null;
}

export interface ResolvedAddress {
  /** Point of interest or building name, when the geocoder supplies one. */
  name: string | null;
  street: string | null;
  streetNumber: string | null;
  district: string | null;
  locality: string | null;
  subregion: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  isoCountryCode: string | null;
  formatted: string | null;
  /** Where the address came from, so the UI can distinguish fresh from cached results. */
  source: 'geocoder' | 'cache';
  /** Epoch ms when the address was resolved by the geocoder. */
  resolvedAt: number;
  /** Coordinates the geocoder was queried with. */
  queryLatitude: number;
  queryLongitude: number;
}

/** Location information frozen at the moment of capture. */
export interface CaptureLocation {
  freshness: LocationFreshness;
  reading: LocationReading | null;
  /** Age of the reading at capture time in milliseconds. */
  ageMs: number | null;
  address: ResolvedAddress | null;
  heading: number | null;
}
