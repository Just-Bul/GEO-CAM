import { Ionicons } from '@expo/vector-icons';
import { CameraView, useMicrophonePermissions } from 'expo-camera';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLogo } from '../components/BrandLogo';
import { CameraControls } from '../components/CameraControls';
import { CameraPreview } from '../components/CameraPreview';
import { describeLocation, LocationStatus } from '../components/LocationStatus';
import { LocationStampPreview } from '../components/LocationStampPreview';
import { showToast } from '../components/Toast';
import { loadPictureSizes, pictureSizesStore, resolvePictureSize } from '../features/camera/cameraService';
import { useCaptureController } from '../features/camera/useCaptureController';
import { deviceTimeZone, freezeCaptureLocation } from '../features/location/captureLocation';
import {
  requestLocationPermission,
  requestPreciseLocation,
  startLocationUpdates,
} from '../features/location/locationService';
import { mapNetworkAllowed, useMiniMap } from '../features/maps/mapService';
import { updateSettings, useSettings } from '../features/settings/settingsService';
import { useStampFonts, useStampLogo } from '../features/stamping/stampFonts';
import { buildStampContent, stampStyleFrom } from '../features/stamping/stampTemplates';
import { useLocationTracking } from '../hooks/useLocationTracking';
import { useNow } from '../hooks/useNow';
import type { CaptureMode, FlashSetting } from '../types/settings';
import { colors, HIT_TARGET, radii, spacing } from '../theme';
import { formatDuration } from '../utils/format';
import { useStore } from '../utils/store';

const TOP_BAR_HEIGHT = 52;
const FLASH_ORDER: FlashSetting[] = ['off', 'auto', 'on'];
const FLASH_ICON: Record<FlashSetting, keyof typeof Ionicons.glyphMap> = {
  off: 'flash-off-outline',
  auto: 'flash-outline',
  on: 'flash',
};

export default function CameraScreen() {
  const settings = useSettings();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const focused = useIsFocused();
  const cameraRef = useRef<CameraView>(null);
  const fonts = useStampFonts();
  const logo = useStampLogo();
  const now = useNow(1000);
  const { snapshot, address } = useLocationTracking();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [mode, setMode] = useState<CaptureMode>(settings.camera.defaultMode);
  const [facing, setFacing] = useState(settings.camera.defaultFacing);
  const [flash, setFlash] = useState<FlashSetting>(settings.camera.flash);
  const [torch, setTorch] = useState(false);
  const [zoom, setZoom] = useState(settings.camera.rememberZoom ? settings.camera.lastZoom : 0);
  const [ready, setReady] = useState(false);
  const [mountError, setMountError] = useState(false);
  const { busy, processing, recording, lastAssetId, shutter } = useCaptureController(cameraRef);
  const pictureSizes = useStore(pictureSizesStore);

  // Preview frame sized to the output aspect ratio, fitted to the screen.
  const aspect = mode === 'photo' ? 4 / 3 : 16 / 9;
  const frameTop = insets.top + (mode === 'photo' ? TOP_BAR_HEIGHT : 0);
  const maxFrameHeight = screenHeight - frameTop - (mode === 'photo' ? 150 + insets.bottom : 0);
  const frameWidth = Math.min(screenWidth, maxFrameHeight / aspect);
  const frameHeight = frameWidth * aspect;

  const locationInfo = describeLocation(snapshot, now, settings.location);

  // Live stamp preview: rebuilt every second (clock) and whenever location/address changes.
  const stampContent = useMemo(() => {
    const location = freezeCaptureLocation(settings.location, now);
    return buildStampContent(location, new Date(now), settings.stamp, deviceTimeZone());
    // `snapshot` and `address` are read inside freezeCaptureLocation through their stores.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, snapshot, address, settings.stamp, settings.location]);
  const stampStyle = useMemo(() => stampStyleFrom(settings.stamp), [settings.stamp]);
  // Mini map for the exact coordinates shown in the stamp (none when location is unavailable).
  const previewLocation = freezeCaptureLocation(settings.location, now);
  const mapLat = previewLocation.reading?.latitude ?? null;
  const mapLon = previewLocation.reading?.longitude ?? null;
  const mapCoords = useMemo(
    () => (mapLat != null && mapLon != null ? { latitude: mapLat, longitude: mapLon } : null),
    [mapLat, mapLon],
  );
  const miniMap = useMiniMap(mapCoords, settings.stamp.enabled && settings.stamp.showMap, mapNetworkAllowed(settings));


  const elapsed = recording ? Math.max(0, Math.floor((now - recording.startedAt.getTime()) / 1000)) : 0;

  useEffect(() => {
    if (settings.camera.rememberZoom) {
      const timer = setTimeout(() => updateSettings('camera', { lastZoom: zoom }), 600);
      return () => clearTimeout(timer);
    }
  }, [zoom, settings.camera.rememberZoom]);

  // Ask once whether to use online maps (they are off until the user agrees).
  const locationGranted = snapshot.permission === 'granted-precise' || snapshot.permission === 'granted-approximate';
  const askForMaps =
    focused &&
    locationGranted &&
    settings.stamp.enabled &&
    settings.stamp.showMap &&
    !settings.privacy.allowOnlineMaps &&
    !settings.privacy.offlineMode &&
    !settings.privacy.mapPromptShown;
  useEffect(() => {
    if (!askForMaps) return;
    const timer = setTimeout(() => {
      Alert.alert(
        'Show a map in the stamp?',
        'GEO-CAM can add a small street map of the exact spot. Map pictures are downloaded from OpenStreetMap, which receives the map area. Maps of places you have been are saved and keep working offline. You can change this in Settings → Privacy.',
        [
          { text: 'Not now', style: 'cancel', onPress: () => updateSettings('privacy', { mapPromptShown: true }) },
          {
            text: 'Use online maps',
            onPress: () => updateSettings('privacy', { allowOnlineMaps: true, mapPromptShown: true }),
          },
        ],
        { cancelable: false },
      );
    }, 1200);
    return () => clearTimeout(timer);
  }, [askForMaps]);

  const muted = !settings.camera.recordAudio || !micPermission?.granted;

  async function onModeChange(next: CaptureMode) {
    if (next === mode) return;
    if (next === 'video' && settings.camera.recordAudio && micPermission && !micPermission.granted) {
      if (micPermission.canAskAgain) {
        const result = await requestMicPermission();
        if (!result.granted) showToast('Microphone access is off. Videos will be recorded without sound.', 'warning');
      } else {
        showToast('Microphone access is off. Videos will be recorded without sound.', 'warning');
      }
    }
    setReady(false);
    setTorch(false);
    setMode(next);
  }

  function onLocationPress() {
    const buttons: { text: string; onPress?: () => void; style?: 'cancel' }[] = [{ text: 'OK', style: 'cancel' }];
    if (snapshot.permission === 'denied' || snapshot.permission === 'undetermined') {
      // The system still allows asking again: show the OS prompt directly.
      buttons.unshift({
        text: 'Allow location',
        onPress: async () => {
          const result = await requestLocationPermission();
          if (result === 'granted-precise' || result === 'granted-approximate') {
            startLocationUpdates({ promptIfNeeded: false, watchHeading: settings.stamp.showCompass });
          }
        },
      });
    } else if (snapshot.permission === 'granted-approximate') {
      buttons.unshift({ text: 'Use precise location', onPress: () => requestPreciseLocation() });
    } else if (snapshot.permission !== 'granted-precise') {
      buttons.unshift({ text: 'Open Settings', onPress: () => Linking.openSettings() });
    }
    Alert.alert(locationInfo.label, locationInfo.description, buttons);
  }

  // Microphone on/off lives next to the torch in video mode (not in Settings).
  const micOn = settings.camera.recordAudio && !!micPermission?.granted;
  async function toggleMic() {
    if (micOn) {
      updateSettings('camera', { recordAudio: false });
      showToast('Sound off: videos are recorded without audio', 'info');
      return;
    }
    let granted = !!micPermission?.granted;
    if (!granted && micPermission?.canAskAgain !== false) granted = (await requestMicPermission()).granted;
    if (!granted) {
      Alert.alert('Microphone is off', 'Allow microphone access in Settings to record sound with videos.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]);
      return;
    }
    updateSettings('camera', { recordAudio: true });
    showToast('Sound on', 'info');
  }

  const flashControl =
    mode === 'photo' ? (
      <IconButton
        icon={FLASH_ICON[flash]}
        label={`Flash ${flash}`}
        onPress={() => setFlash(FLASH_ORDER[(FLASH_ORDER.indexOf(flash) + 1) % FLASH_ORDER.length])}
      />
    ) : (
      <View style={styles.leftControls}>
        <IconButton
          icon={torch ? 'flashlight' : 'flashlight-outline'}
          label={torch ? 'Torch on' : 'Torch off'}
          onPress={() => setTorch((value) => !value)}
        />
        <IconButton
          icon={micOn ? 'mic' : 'mic-off'}
          label={micOn ? 'Sound on, tap to record without sound' : 'Sound off, tap to record with sound'}
          onPress={toggleMic}
          disabled={!!recording}
          tint={micOn ? colors.white : colors.danger}
        />
      </View>
    );

  return (
    <View style={styles.container}>
      <View style={[styles.frameWrap, { top: frameTop }]}>
        <CameraPreview
          ref={cameraRef}
          active={focused}
          mode={mode === 'photo' ? 'picture' : 'video'}
          facing={facing}
          flash={mode === 'photo' ? flash : 'off'}
          enableTorch={mode === 'video' && torch}
          mute={muted}
          videoQuality={settings.camera.videoQuality}
          pictureSize={mode === 'photo' ? resolvePictureSize(settings.camera.pictureSize, pictureSizes) : undefined}
          zoom={zoom}
          onZoomChange={setZoom}
          width={frameWidth}
          height={frameHeight}
          showGrid={settings.camera.showGrid}
          onCameraReady={() => {
            setReady(true);
            if (mode === 'photo') loadPictureSizes(cameraRef.current);
            setMountError(false);
          }}
          onMountError={() => setMountError(true)}
        >
          {fonts && settings.stamp.enabled ? (
            <LocationStampPreview
              width={frameWidth}
              height={frameHeight}
              fonts={fonts}
              content={stampContent}
              style={stampStyle}
              mapImage={miniMap.image}
              logoImage={logo}
            />
          ) : null}
          <View
            style={[styles.statusRow, mode === 'video' && { top: TOP_BAR_HEIGHT + spacing.sm }]}
            pointerEvents="box-none"
          >
            <LocationStatus info={locationInfo} onPress={onLocationPress} />
            {zoom > 0.001 ? (
              <Pressable onPress={() => setZoom(0)} style={styles.zoomChip} accessibilityRole="button" accessibilityLabel="Reset zoom">
                <Text style={styles.zoomText}>Zoom {Math.round(zoom * 100)}%</Text>
              </Pressable>
            ) : null}
          </View>
        </CameraPreview>
        {mountError ? (
          <View style={[StyleSheet.absoluteFill, styles.center]}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
            <Text style={styles.errorText}>
              The camera could not be started. Close other camera apps and try again.
            </Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.topBar, { paddingTop: insets.top, height: insets.top + TOP_BAR_HEIGHT }]}>
        <View style={styles.sideLeft}>{flashControl}</View>
        <View accessibilityRole="header" accessibilityLabel="GEO-CAM">
          <BrandLogo variant="wordmark" height={26} />
        </View>
        <View style={styles.sideRight}>
          <IconButton icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} disabled={!!recording || busy} />
        </View>
      </View>

      {recording ? (
        <View style={[styles.recordingBadge, { top: insets.top + TOP_BAR_HEIGHT + spacing.sm }]}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingText} accessibilityLiveRegion="polite">
            {formatDuration(elapsed)}
          </Text>
        </View>
      ) : null}

      <View style={styles.bottom}>
        <CameraControls
          mode={mode}
          onModeChange={onModeChange}
          onShutter={() => shutter(mode)}
          onFlip={() => {
            setReady(false);
            setFacing((value) => (value === 'back' ? 'front' : 'back'));
          }}
          onOpenGallery={() => router.push('/gallery')}
          thumbnailUri={lastAssetId}
          recording={!!recording}
          busy={busy && !recording}
          disabled={!ready || mountError}
          bottomInset={insets.bottom}
        />
      </View>

      {processing ? (
        <View style={styles.processing} accessibilityViewIsModal>
          <View style={styles.processingCard}>
            <ActivityIndicator color={colors.white} />
            <Text style={styles.processingText}>
              {processing.label}
              {processing.progress != null ? ` ${Math.round(processing.progress * 100)}%` : ''}
            </Text>
            {processing.cancel ? (
              <Pressable onPress={processing.cancel} style={styles.cancelButton} accessibilityRole="button">
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  disabled,
  tint = colors.white,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={[styles.iconButton, disabled && { opacity: 0.4 }]}
    >
      <Ionicons name={icon} size={24} color={tint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.black },
  frameWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  leftControls: { flexDirection: 'row', alignItems: 'center' },
  // Equal-width sides keep the wordmark centred whatever is on the left.
  sideLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  sideRight: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.overlay,
  },
  iconButton: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: HIT_TARGET / 2,
  },
  statusRow: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  zoomChip: {
    backgroundColor: colors.overlay,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  zoomText: { color: colors.white, fontSize: 12, fontWeight: '600' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  recordingBadge: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlayStrong,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.recording, marginRight: 6 },
  recordingText: { color: colors.white, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  errorText: { color: colors.text, textAlign: 'center', fontSize: 15 },
  processing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingCard: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    minWidth: 220,
  },
  processingText: { color: colors.text, fontSize: 15 },
  cancelButton: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minHeight: HIT_TARGET, justifyContent: 'center' },
  cancelText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
});
