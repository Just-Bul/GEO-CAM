import { DEFAULT_SETTINGS } from '../src/features/settings/settingsDefaults';
import type { CaptureLocation, LocationReading, ResolvedAddress } from '../src/features/location/locationTypes';
import type { StampSettings } from '../src/types/settings';

export const sampleReading: LocationReading = {
  latitude: 23.780573,
  longitude: 90.407015,
  accuracy: 7.4,
  altitude: 12.3,
  altitudeAccuracy: 3,
  speed: null,
  course: null,
  timestamp: Date.UTC(2026, 9, 10, 8, 5, 9),
  mocked: false,
  source: 'live',
};

export const sampleAddress: ResolvedAddress = {
  name: 'Gulshan Avenue',
  street: 'Gulshan Avenue',
  streetNumber: '54',
  district: 'Gulshan',
  locality: 'Dhaka',
  subregion: 'Dhaka District',
  region: 'Dhaka Division',
  postalCode: '1212',
  country: 'Bangladesh',
  isoCountryCode: 'BD',
  formatted: '54 Gulshan Avenue, Gulshan 1, Dhaka 1212, Bangladesh',
  source: 'geocoder',
  resolvedAt: Date.UTC(2026, 9, 10, 8, 5, 0),
  queryLatitude: 23.780573,
  queryLongitude: 90.407015,
};

export const currentLocation: CaptureLocation = {
  freshness: 'current',
  reading: sampleReading,
  ageMs: 900,
  address: sampleAddress,
  heading: 212,
};

export function stampSettings(overrides: Partial<StampSettings> = {}): StampSettings {
  return { ...DEFAULT_SETTINGS.stamp, ...overrides };
}
