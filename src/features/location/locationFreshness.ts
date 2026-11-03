import type { LocationSettings } from '../../types/settings';
import type { LocationFreshness, LocationReading } from './locationTypes';

export interface FreshnessResult {
  freshness: LocationFreshness;
  ageMs: number | null;
}

/**
 * Classifies a reading at a given instant.
 * - `current`: obtained by a live request in this session and newer than `currentMaxAgeSec`.
 * - `cached`: older, or served from the OS cache, but still within `cachedMaxAgeMin` (if allowed).
 * - `unavailable`: no reading, or too old to use.
 */
export function classifyReading(
  reading: LocationReading | null,
  now: number,
  settings: LocationSettings,
): FreshnessResult {
  if (!reading) return { freshness: 'unavailable', ageMs: null };
  // Clock differences between the GPS fix time and the device clock can make the
  // age slightly negative; clamp so it is never shown as "from the future".
  const ageMs = Math.max(0, now - reading.timestamp);
  if (reading.source === 'live' && ageMs <= settings.currentMaxAgeSec * 1000) {
    return { freshness: 'current', ageMs };
  }
  if (settings.allowCachedLocation && ageMs <= settings.cachedMaxAgeMin * 60_000) {
    return { freshness: 'cached', ageMs };
  }
  return { freshness: 'unavailable', ageMs };
}

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in meters. */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
