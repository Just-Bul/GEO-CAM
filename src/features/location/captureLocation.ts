import { getCalendars } from 'expo-localization';

import type { LocationSettings } from '../../types/settings';
import { addressStore } from './addressResolver';
import { classifyReading, distanceMeters } from './locationFreshness';
import { locationStore } from './locationService';
import type { CaptureLocation } from './locationTypes';

/** Address results are only attached when they were resolved for (nearly) the same spot. */
const ADDRESS_MATCH_RADIUS_M = 60;

/** Freezes the location state at the moment of capture. */
export function freezeCaptureLocation(settings: LocationSettings, now = Date.now()): CaptureLocation {
  const { reading, heading } = locationStore.get();
  const { freshness, ageMs } = classifyReading(reading, now, settings);
  if (freshness === 'unavailable' || !reading) {
    return { freshness: 'unavailable', reading: null, ageMs, address: null, heading };
  }
  const address = addressStore.get().address;
  const matches =
    address &&
    distanceMeters({ latitude: address.queryLatitude, longitude: address.queryLongitude }, reading) <=
      ADDRESS_MATCH_RADIUS_M;
  return { freshness, reading, ageMs, address: matches ? address : null, heading };
}

/** IANA time zone of the device, e.g. "Asia/Dhaka", or null if unknown. */
export function deviceTimeZone(): string | null {
  try {
    return getCalendars()[0]?.timeZone ?? null;
  } catch {
    return null;
  }
}
