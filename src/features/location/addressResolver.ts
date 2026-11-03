import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import { logError } from '../../utils/errors';
import { createStore } from '../../utils/store';
import { distanceMeters } from './locationFreshness';
import type { LocationReading, ResolvedAddress } from './locationTypes';

const CACHE_KEY = 'geocam.addressCache.v1';
const MAX_CACHE_ENTRIES = 300;
/** A cached address is reused only within this distance of where it was resolved. */
const CACHE_RADIUS_M = 40;
/** Re-query the geocoder only after moving this far from the last query. */
const REQUERY_DISTANCE_M = 30;
/** Minimum interval between geocoder requests (they are rate-limited by the OS). */
const MIN_INTERVAL_MS = 8000;

export type AddressStatus = 'idle' | 'resolving' | 'resolved' | 'unavailable' | 'offline' | 'disabled';

export interface AddressState {
  status: AddressStatus;
  address: ResolvedAddress | null;
}

export const addressStore = createStore<AddressState>({ status: 'idle', address: null });

let cache: ResolvedAddress[] | null = null;
let inFlight = false;
let lastQueryAt = 0;
let lastQueryPoint: { latitude: number; longitude: number } | null = null;

async function loadCache(): Promise<ResolvedAddress[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache;
}

function saveCache() {
  if (!cache) return;
  AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache.slice(0, MAX_CACHE_ENTRIES))).catch(() => {});
}

function findCached(entries: ResolvedAddress[], reading: LocationReading): ResolvedAddress | null {
  let best: ResolvedAddress | null = null;
  let bestDistance = Infinity;
  for (const entry of entries) {
    const d = distanceMeters(
      { latitude: entry.queryLatitude, longitude: entry.queryLongitude },
      reading,
    );
    if (d < bestDistance) {
      best = entry;
      bestDistance = d;
    }
  }
  return best && bestDistance <= CACHE_RADIUS_M ? { ...best, source: 'cache' } : null;
}

function fromGeocoder(result: Location.LocationGeocodedAddress, reading: LocationReading): ResolvedAddress | null {
  const address: ResolvedAddress = {
    name: result.name ?? null,
    street: result.street ?? null,
    streetNumber: result.streetNumber ?? null,
    district: result.district ?? null,
    locality: result.city ?? null,
    subregion: result.subregion ?? null,
    region: result.region ?? null,
    postalCode: result.postalCode ?? null,
    country: result.country ?? null,
    isoCountryCode: result.isoCountryCode ?? null,
    formatted: result.formattedAddress ?? null,
    source: 'geocoder',
    resolvedAt: Date.now(),
    queryLatitude: reading.latitude,
    queryLongitude: reading.longitude,
  };
  const hasContent = [
    address.name,
    address.street,
    address.locality,
    address.region,
    address.country,
    address.formatted,
  ].some((value) => value && value.trim());
  return hasContent ? address : null;
}

export interface AddressPolicy {
  /** Strict offline mode: only the local cache may be used. */
  offlineMode: boolean;
  /** User allowed geocoder (network) lookups. */
  allowLookup: boolean;
}

/**
 * Updates the address for a new reading. Uses the local cache first, then
 * (only if allowed) the platform geocoder. Never invents an address: when
 * nothing is available the state is `unavailable` and the stamp shows coordinates.
 */
export async function updateAddressFor(reading: LocationReading | null, policy: AddressPolicy) {
  if (!reading) {
    addressStore.set({ status: 'idle', address: null });
    return;
  }
  const entries = await loadCache();
  const cached = findCached(entries, reading);
  const current = addressStore.get().address;

  // Drop an address that no longer matches where we are.
  if (
    current &&
    distanceMeters({ latitude: current.queryLatitude, longitude: current.queryLongitude }, reading) >
      CACHE_RADIUS_M
  ) {
    addressStore.set({ status: 'idle', address: null });
  }

  if (cached) {
    addressStore.set({ status: 'resolved', address: cached });
  }

  if (policy.offlineMode || !policy.allowLookup) {
    if (!cached) {
      addressStore.set({ status: policy.offlineMode ? 'offline' : 'disabled', address: null });
    }
    return;
  }

  if (cached && Date.now() - cached.resolvedAt < 7 * 24 * 60 * 60 * 1000) return;
  if (inFlight) return;
  const now = Date.now();
  if (now - lastQueryAt < MIN_INTERVAL_MS) return;
  if (lastQueryPoint && distanceMeters(lastQueryPoint, reading) < REQUERY_DISTANCE_M && addressStore.get().address) {
    return;
  }

  inFlight = true;
  lastQueryAt = now;
  lastQueryPoint = { latitude: reading.latitude, longitude: reading.longitude };
  if (!addressStore.get().address) addressStore.set({ status: 'resolving', address: null });
  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: reading.latitude,
      longitude: reading.longitude,
    });
    const address = results.length ? fromGeocoder(results[0], reading) : null;
    if (address) {
      cache = [address, ...entries.filter((e) => e !== cached)].slice(0, MAX_CACHE_ENTRIES);
      saveCache();
      addressStore.set({ status: 'resolved', address });
    } else if (!addressStore.get().address) {
      addressStore.set({ status: 'unavailable', address: null });
    }
  } catch (error) {
    // Typical causes: no network, no geocoder backend on the device, or rate limiting.
    logError('reverseGeocode', error);
    if (!addressStore.get().address) addressStore.set({ status: 'unavailable', address: null });
  } finally {
    inFlight = false;
  }
}

export async function clearAddressCache() {
  cache = [];
  lastQueryPoint = null;
  lastQueryAt = 0;
  addressStore.set({ status: 'idle', address: null });
  await AsyncStorage.removeItem(CACHE_KEY);
}

export async function addressCacheSize(): Promise<number> {
  return (await loadCache()).length;
}
