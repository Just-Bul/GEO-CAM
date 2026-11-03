import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';

import { logError } from '../../utils/errors';
import { createStore } from '../../utils/store';
import type {
  LocationPermissionState,
  LocationReading,
  LocationSnapshot,
} from './locationTypes';
import { createPositionFilter } from './positionFilter';

const initialSnapshot: LocationSnapshot = {
  status: 'idle',
  permission: 'undetermined',
  reading: null,
  heading: null,
  errorCode: null,
};

export const locationStore = createStore<LocationSnapshot>(initialSnapshot);

function patch(update: Partial<LocationSnapshot>) {
  locationStore.set((previous) => ({ ...previous, ...update }));
}

function toReading(object: Location.LocationObject, source: LocationReading['source']): LocationReading {
  const { coords } = object;
  const valid = (value: number | null | undefined) =>
    value == null || !Number.isFinite(value) ? null : value;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: valid(coords.accuracy),
    altitude: valid(coords.altitude),
    altitudeAccuracy: valid(coords.altitudeAccuracy),
    // The platforms report -1 for "unknown" speed and course.
    speed: coords.speed != null && coords.speed >= 0 ? coords.speed : null,
    course: coords.heading != null && coords.heading >= 0 ? coords.heading : null,
    timestamp: object.timestamp,
    mocked: object.mocked === true,
    source,
  };
}

function isPlausible(reading: LocationReading) {
  return (
    Number.isFinite(reading.latitude) &&
    Number.isFinite(reading.longitude) &&
    Math.abs(reading.latitude) <= 90 &&
    Math.abs(reading.longitude) <= 180 &&
    // (0, 0) is what some broken providers emit when they have nothing.
    !(reading.latitude === 0 && reading.longitude === 0)
  );
}

export function permissionStateFrom(response: Location.LocationPermissionResponse): LocationPermissionState {
  if (response.granted) {
    const reduced =
      response.android?.accuracy === 'coarse' || response.ios?.accuracy === 'reduced';
    return reduced ? 'granted-approximate' : 'granted-precise';
  }
  if (response.status === Location.PermissionStatus.UNDETERMINED) return 'undetermined';
  return response.canAskAgain ? 'denied' : 'blocked';
}

let positionSubscription: Location.LocationSubscription | null = null;
let headingSubscription: Location.LocationSubscription | null = null;
let starting = false;
/**
 * A start request that arrived while another start was still in progress.
 * Typical case: the permission dialog pauses the activity (the app reports
 * "background", which stops updates) and resumes it before the first start
 * has finished. Without this, no position watch would be left running.
 */
let pendingStart: StartOptions | null = null;
let generation = 0;
let servicesCheckTimer: ReturnType<typeof setInterval> | null = null;
const positionFilter = createPositionFilter();
/** Android shows the "change to precise location" dialog at most once per app launch. */
let preciseUpgradeAsked = false;

export async function refreshLocationPermission(): Promise<LocationPermissionState> {
  try {
    const response = await Location.getForegroundPermissionsAsync();
    const permission = permissionStateFrom(response);
    patch({ permission });
    return permission;
  } catch (error) {
    logError('getForegroundPermissions', error);
    return locationStore.get().permission;
  }
}

/** Shows the OS permission prompt. Only called from an explicit user-facing flow. */
export async function requestLocationPermission(): Promise<LocationPermissionState> {
  try {
    const response = await Location.requestForegroundPermissionsAsync();
    const permission = permissionStateFrom(response);
    patch({ permission });
    return permission;
  } catch (error) {
    logError('requestForegroundPermissions', error);
    return refreshLocationPermission();
  }
}

function acceptReading(raw: LocationReading) {
  if (!isPlausible(raw)) return;
  const previous = locationStore.get().reading;
  // Never replace a newer reading with an older OS-cached one.
  if (previous && raw.source === 'last-known' && previous.timestamp >= raw.timestamp) return;
  // Live fixes are smoothed so the coordinates do not jitter; OS-cached ones are shown as-is.
  const reading = raw.source === 'live' ? positionFilter.update(raw) : raw;
  if (!reading) return;
  patch({ reading, status: 'active', errorCode: null });
}

/**
 * Asks the user to allow precise location when only approximate was granted.
 * Android 12+ shows the upgrade dialog; iOS only allows this in Settings.
 */
export async function requestPreciseLocation(): Promise<LocationPermissionState> {
  preciseUpgradeAsked = true;
  if (Platform.OS === 'ios') {
    await Linking.openSettings().catch(() => {});
    return locationStore.get().permission;
  }
  const permission = await requestLocationPermission();
  if (permission === 'granted-approximate') Linking.openSettings().catch(() => {});
  return permission;
}

export interface StartOptions {
  /** Prompt for permission if it has not been decided yet. */
  promptIfNeeded: boolean;
  /** Subscribe to the compass (only when the stamp shows a heading). */
  watchHeading: boolean;
}

/**
 * Starts foreground location updates. Updates stop when `stopLocationUpdates`
 * is called (the camera screen does this when it loses focus or the app is backgrounded).
 * No background location is ever requested.
 */
export async function startLocationUpdates(options: StartOptions): Promise<void> {
  if (positionSubscription) {
    await setHeadingWatch(options.watchHeading);
    return;
  }
  if (starting) {
    pendingStart = options;
    return;
  }
  starting = true;
  const myGeneration = ++generation;
  try {
    let permission = await refreshLocationPermission();
    if (permission === 'undetermined' && options.promptIfNeeded) {
      permission = await requestLocationPermission();
    }
    // Approximate location can be kilometers off: ask once for precise location (Android 12+ dialog).
    if (
      permission === 'granted-approximate' &&
      options.promptIfNeeded &&
      Platform.OS === 'android' &&
      !preciseUpgradeAsked
    ) {
      preciseUpgradeAsked = true;
      permission = await requestLocationPermission();
    }
    if (permission !== 'granted-precise' && permission !== 'granted-approximate') {
      patch({ status: 'permission-required' });
      return;
    }

    const servicesEnabled = await Location.hasServicesEnabledAsync().catch(() => true);
    if (!servicesEnabled) {
      patch({ status: 'services-disabled' });
      watchForServices(options);
      return;
    }

    if (!locationStore.get().reading) patch({ status: 'searching' });
    positionFilter.reset();

    // Seed with the OS cache so the user immediately sees *something*, clearly labelled as cached.
    Location.getLastKnownPositionAsync({ maxAge: 24 * 60 * 60 * 1000 })
      .then((last) => {
        if (last && myGeneration === generation) acceptReading(toReading(last, 'last-known'));
      })
      .catch((error) => logError('getLastKnownPosition', error));

    const subscription = await Location.watchPositionAsync(
      {
        // Best available: GPS + Wi-Fi/cell fusion on Android, best-for-navigation on iOS.
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 0,
        mayShowUserSettingsDialog: true,
      },
      (object) => {
        if (myGeneration === generation) acceptReading(toReading(object, 'live'));
      },
      (reason) => {
        logError('watchPosition', reason);
        patch({ status: 'error', errorCode: 'watch-failed' });
      },
    );
    if (myGeneration !== generation) {
      subscription.remove();
      return;
    }
    positionSubscription = subscription;
    await setHeadingWatch(options.watchHeading);
  } catch (error) {
    logError('startLocationUpdates', error);
    const servicesEnabled = await Location.hasServicesEnabledAsync().catch(() => true);
    patch({
      status: servicesEnabled ? 'error' : 'services-disabled',
      errorCode: servicesEnabled ? 'start-failed' : null,
    });
    if (!servicesEnabled) watchForServices(options);
  } finally {
    starting = false;
    const next = pendingStart;
    pendingStart = null;
    if (next && !positionSubscription) startLocationUpdates({ ...next, promptIfNeeded: false });
  }
}

function watchForServices(options: StartOptions) {
  if (servicesCheckTimer) return;
  servicesCheckTimer = setInterval(async () => {
    const enabled = await Location.hasServicesEnabledAsync().catch(() => false);
    if (enabled) {
      clearServicesTimer();
      startLocationUpdates({ ...options, promptIfNeeded: false });
    }
  }, 3000);
}

function clearServicesTimer() {
  if (servicesCheckTimer) {
    clearInterval(servicesCheckTimer);
    servicesCheckTimer = null;
  }
}

async function setHeadingWatch(enabled: boolean) {
  if (!enabled) {
    headingSubscription?.remove();
    headingSubscription = null;
    patch({ heading: null });
    return;
  }
  if (headingSubscription) return;
  try {
    headingSubscription = await Location.watchHeadingAsync((heading) => {
      // trueHeading is -1 when unavailable; fall back to magnetic heading.
      const value = heading.trueHeading >= 0 ? heading.trueHeading : heading.magHeading;
      // Accuracy 0 means the compass is uncalibrated; do not report a direction then.
      patch({ heading: heading.accuracy > 0 && value >= 0 ? value : null });
    });
  } catch (error) {
    logError('watchHeading', error);
  }
}

export function stopLocationUpdates() {
  pendingStart = null;
  generation += 1;
  positionSubscription?.remove();
  positionSubscription = null;
  headingSubscription?.remove();
  headingSubscription = null;
  clearServicesTimer();
  const { status } = locationStore.get();
  if (status === 'active' || status === 'searching') patch({ status: 'idle' });
}

export function getCurrentReading(): LocationReading | null {
  return locationStore.get().reading;
}

/**
 * Waits up to `timeoutMs` for a live reading newer than `newerThan`.
 * Used when the user explicitly chooses "Wait for location".
 */
export function waitForLiveReading(newerThan: number, timeoutMs: number): Promise<LocationReading | null> {
  return new Promise((resolve) => {
    const check = () => {
      const reading = locationStore.get().reading;
      if (reading && reading.source === 'live' && reading.timestamp > newerThan) {
        cleanup();
        resolve(reading);
      }
    };
    const unsubscribe = locationStore.subscribe(check);
    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);
    function cleanup() {
      unsubscribe();
      clearTimeout(timer);
    }
    check();
  });
}
