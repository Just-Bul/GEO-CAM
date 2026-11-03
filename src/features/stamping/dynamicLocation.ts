import type { AppSettings } from '../../types/settings';
import { classifyReading, distanceMeters } from '../location/locationFreshness';
import type { CaptureLocation, LocationReading } from '../location/locationTypes';

/** Real readings captured during a recording (dynamic mode). */
export interface LocationSample {
  reading: LocationReading;
  heading: number | null;
}

/** An address stays attached only while the device is within this distance of where it was resolved. */
const ADDRESS_RADIUS_M = 60;

/** Location to show at `atMs` (wall clock) using only readings that existed by then. */
export function locationAt(
  atMs: number,
  start: CaptureLocation,
  samples: LocationSample[],
  settings: AppSettings,
): CaptureLocation {
  let latest: LocationSample | null = null;
  for (const sample of samples) {
    if (sample.reading.timestamp <= atMs) latest = sample;
    else break;
  }
  if (!latest) return start;
  const { freshness, ageMs } = classifyReading(latest.reading, atMs, settings.location);
  if (freshness === 'unavailable') return { ...start, freshness: 'unavailable', reading: null, ageMs };
  return {
    freshness,
    reading: latest.reading,
    ageMs,
    // The address resolved at the start is kept only while we are still near it.
    address:
      start.address &&
      distanceMeters(
        { latitude: start.address.queryLatitude, longitude: start.address.queryLongitude },
        latest.reading,
      ) <= ADDRESS_RADIUS_M
        ? start.address
        : null,
    heading: latest.heading,
  };
}
