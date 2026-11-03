import type { CameraView } from 'expo-camera';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Alert, Linking, Platform } from 'react-native';

import { showToast } from '../../components/Toast';
import type { CaptureMode } from '../../types/settings';
import { logError, userMessage } from '../../utils/errors';
import { capturesStore } from '../gallery/mediaRepository';
import { deviceTimeZone, freezeCaptureLocation } from '../location/captureLocation';
import {
  locationStore,
  requestLocationPermission,
  startLocationUpdates,
  waitForLiveReading,
} from '../location/locationService';
import { settingsStore } from '../settings/settingsService';
import { getMiniMap, mapNetworkAllowed } from '../maps/mapService';
import { loadStampFonts, loadStampLogo } from '../stamping/stampFonts';
import { captureAndSavePhoto } from './photoCapture';
import { finishVideo, startRecording, type RecordingSession } from './videoCapture';

export interface ProcessingState {
  label: string;
  progress: number | null;
  cancel: (() => void) | null;
}

type LocationDecision = 'proceed' | 'cancel';

const WAIT_FOR_FIX_MS = 20_000;

function ask(title: string, message: string, buttons: { text: string; value: string; style?: 'cancel' | 'default' | 'destructive' }[]) {
  return new Promise<string>((resolve) => {
    Alert.alert(
      title,
      message,
      buttons.map((button) => ({ text: button.text, style: button.style, onPress: () => resolve(button.value) })),
      { cancelable: true, onDismiss: () => resolve('cancel') },
    );
  });
}

export function useCaptureController(cameraRef: RefObject<CameraView | null>) {
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState<ProcessingState | null>(null);
  const [recording, setRecording] = useState<RecordingSession | null>(null);
  const [lastAssetId, setLastAssetId] = useState<string | null>(() => capturesStore.get()[0]?.assetId ?? null);
  const skipLocationPrompt = useRef(false);
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(
    () =>
      capturesStore.subscribe(() => {
        setLastAssetId(capturesStore.get()[0]?.assetId ?? null);
      }),
    [],
  );

  /**
   * When no usable location exists, the user decides: wait for a fix, capture
   * without location, or cancel. Coordinates are never guessed.
   */
  const decideLocation = useCallback(async (): Promise<LocationDecision> => {
    const settings = settingsStore.get();
    if (!settings.stamp.enabled || skipLocationPrompt.current) return 'proceed';
    if (freezeCaptureLocation(settings.location).freshness !== 'unavailable') return 'proceed';

    const { permission, status } = locationStore.get();
    const noPermission = permission === 'denied' || permission === 'blocked' || status === 'permission-required';
    const waitForFix = async (): Promise<LocationDecision> => {
      setBusy(true);
      setProcessing({ label: 'Waiting for location…', progress: null, cancel: null });
      const reading = await waitForLiveReading(
        Date.now() - settings.location.currentMaxAgeSec * 1000,
        WAIT_FOR_FIX_MS,
      );
      setProcessing(null);
      setBusy(false);
      if (reading) return 'proceed';
      const retry = await ask('Still no location', 'A location fix could not be obtained.', [
        { text: 'Cancel', value: 'cancel', style: 'cancel' },
        { text: 'Capture without location', value: 'proceed' },
      ]);
      return retry === 'proceed' ? 'proceed' : 'cancel';
    };

    if (noPermission || status === 'services-disabled') {
      // Android/iOS still show the permission prompt after a single denial.
      const canAsk = noPermission && permission !== 'blocked';
      const choice = await ask(
        'Location is off',
        noPermission
          ? 'GEO-CAM cannot read your location. The photo will be stamped with date and time only.'
          : 'Location services are turned off. The photo will be stamped with date and time only.',
        [
          { text: 'Cancel', value: 'cancel', style: 'cancel' },
          canAsk ? { text: 'Allow location', value: 'allow' } : { text: 'Open Settings', value: 'settings' },
          { text: 'Capture without location', value: 'proceed' },
        ],
      );
      if (choice === 'allow') {
        const result = await requestLocationPermission();
        if (result !== 'granted-precise' && result !== 'granted-approximate') return 'cancel';
        startLocationUpdates({ promptIfNeeded: false, watchHeading: settings.stamp.showCompass });
        return waitForFix();
      }
      if (choice === 'settings') {
        if (!noPermission && Platform.OS === 'android') {
          Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => Linking.openSettings());
        } else {
          Linking.openSettings().catch(() => {});
        }
        return 'cancel';
      }
      if (choice === 'proceed') skipLocationPrompt.current = true;
      return choice === 'proceed' ? 'proceed' : 'cancel';
    }

    const choice = await ask('No location fix yet', 'Wait for a GPS fix, or capture now without location?', [
      { text: 'Cancel', value: 'cancel', style: 'cancel' },
      { text: 'Capture without location', value: 'proceed' },
      { text: 'Wait for location', value: 'wait' },
    ]);
    if (choice === 'proceed') {
      skipLocationPrompt.current = true;
      return 'proceed';
    }
    return choice === 'wait' ? waitForFix() : 'cancel';
  }, []);

  const takePhoto = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera || busy) return;
    if ((await decideLocation()) === 'cancel') return;
    setBusy(true);
    try {
      const settings = settingsStore.get();
      const location = freezeCaptureLocation(settings.location);
      const fonts = await loadStampFonts();
      const result = await captureAndSavePhoto(
        camera,
        {
          settings,
          location,
          fonts,
          timeZone: deviceTimeZone(),
          mapProvider: (lat, lon) => getMiniMap(lat, lon, mapNetworkAllowed(settings)),
          logoImage: await loadStampLogo(),
        },
        () => setProcessing({ label: 'Saving photo…', progress: null, cancel: null }),
      );
      setLastAssetId(result.record.assetId);
      if (result.warning) showToast(result.warning.message, 'warning');
      else showToast(result.record.stamped ? 'Saved with location stamp' : 'Photo saved', 'success');
    } catch (error) {
      logError('takePhoto', error);
      showToast(userMessage(error, 'capture-failed'), 'error');
    } finally {
      setProcessing(null);
      setBusy(false);
    }
  }, [busy, cameraRef, decideLocation]);

  const processRecording = useCallback(async (session: RecordingSession) => {
    try {
      await session.done;
    } catch (error) {
      setRecording(null);
      showToast(userMessage(error, 'recording-failed'), 'error');
      return;
    }
    setRecording(null);
    setBusy(true);
    setProcessing({ label: 'Saving video…', progress: null, cancel: null });
    try {
      const settings = settingsStore.get();
      const fonts = await loadStampFonts();
      const result = await finishVideo(session, {
        settings,
        fonts,
        timeZone: deviceTimeZone(),
        mapProvider: (lat, lon) => getMiniMap(lat, lon, mapNetworkAllowed(settings)),
        logoImage: await loadStampLogo(),
        onProgress: (phase, progress) =>
          setProcessing({
            label: phase === 'preparing' ? 'Preparing stamp…' : 'Adding location stamp…',
            progress,
            cancel: cancelRef.current,
          }),
        setCancel: (cancel) => {
          cancelRef.current = cancel;
          setProcessing((previous) => (previous ? { ...previous, cancel } : previous));
        },
      });
      setLastAssetId(result.record.assetId);
      if (result.warning) showToast(result.warning.message, 'warning');
      else showToast(result.record.stamped ? 'Video saved with location stamp' : 'Video saved', 'success');
    } catch (error) {
      logError('finishVideo', error);
      showToast(userMessage(error, 'recording-failed'), 'error');
    } finally {
      cancelRef.current = null;
      setProcessing(null);
      setBusy(false);
    }
  }, []);

  const toggleRecording = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera) return;
    if (recording) {
      recording.stop();
      return;
    }
    if (busy) return;
    if ((await decideLocation()) === 'cancel') return;
    try {
      const settings = settingsStore.get();
      const session = startRecording(camera, freezeCaptureLocation(settings.location));
      setRecording(session);
      processRecording(session);
    } catch (error) {
      logError('startRecording', error);
      showToast(userMessage(error, 'recording-failed'), 'error');
    }
  }, [busy, cameraRef, decideLocation, processRecording, recording]);

  const shutter = useCallback(
    (mode: CaptureMode) => (mode === 'photo' ? takePhoto() : toggleRecording()),
    [takePhoto, toggleRecording],
  );

  return { busy, processing, recording, lastAssetId, shutter };
}
