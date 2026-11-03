import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';

import { addressStore, updateAddressFor } from '../features/location/addressResolver';
import { locationStore, startLocationUpdates, stopLocationUpdates } from '../features/location/locationService';
import { useSettings } from '../features/settings/settingsService';
import { useStore } from '../utils/store';

/**
 * Runs foreground location updates only while the calling screen is focused and
 * the app is in the foreground. Address lookups follow the privacy settings.
 */
export function useLocationTracking() {
  const settings = useSettings();
  const watchHeading = settings.stamp.enabled && settings.stamp.showCompass;
  const { offlineMode, allowAddressLookup } = settings.privacy;

  useFocusEffect(
    useCallback(() => {
      let active = AppState.currentState === 'active';
      if (active) startLocationUpdates({ promptIfNeeded: true, watchHeading });
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active' && !active) {
          active = true;
          startLocationUpdates({ promptIfNeeded: false, watchHeading });
        } else if (state !== 'active' && active) {
          active = false;
          stopLocationUpdates();
        }
      });
      return () => {
        subscription.remove();
        stopLocationUpdates();
      };
    }, [watchHeading]),
  );

  const snapshot = useStore(locationStore);
  const address = useStore(addressStore);

  useEffect(() => {
    updateAddressFor(snapshot.reading, { offlineMode, allowLookup: allowAddressLookup });
  }, [snapshot.reading, offlineMode, allowAddressLookup]);

  return { snapshot, address };
}
